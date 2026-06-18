const {
  createCameraTransaction,
  findDuplicateCameraTransaction,
  findOpenTransactionByPlateNo,
} = require('../data/repositories/transactions.repo');
const appEvents = require('../utils/events');

const DUPLICATE_WINDOW_MS = 10 * 1000;

// Function สร้าง response มาตรฐานสำหรับ gate/camera integration
function toGateResponse(transaction, action, message, success, direction = transaction.receipt?.camera?.direction, extra = {}) {
  return {
    success,
    action,
    message,
    data: {
      transactionId: transaction.id,
      plateNo: transaction.plateNo,
      direction,
      status: transaction.status,
      ...extra,
    },
  };
}

function getCapturedTime(dto) {
  const capturedTime = dto.capturedAt ? new Date(dto.capturedAt) : new Date();
  return Number.isNaN(capturedTime.getTime()) ? new Date() : capturedTime;
}

function getExitTimeLimit(transaction) {
  if (!transaction?.exitTimeLimit) return null;
  const exitTimeLimit = new Date(transaction.exitTimeLimit);
  return Number.isNaN(exitTimeLimit.getTime()) ? null : exitTimeLimit;
}

function validateExitEligibility(transaction, capturedTime) {
  if (!transaction) {
    return { ok: false, action: 'TRANSACTION_NOT_FOUND', message: 'ไม่พบรายการจอดที่ยังเปิดอยู่' };
  }

  if (transaction.status !== 'paid_waiting_exit') {
    return { ok: false, action: 'PAYMENT_REQUIRED', message: 'รายการนี้ยังชำระเงินไม่ครบ กรุณาชำระเงินก่อนออก' };
  }

  const exitTimeLimit = getExitTimeLimit(transaction);
  if (!exitTimeLimit || capturedTime > exitTimeLimit) {
    return {
      ok: false,
      action: 'PAYMENT_REQUIRED',
      message: 'หมดเวลาออกหลังชำระเงินแล้ว กรุณาชำระเงินใหม่ก่อนออก',
      exitTimeLimit: exitTimeLimit ? exitTimeLimit.toISOString() : null,
    };
  }

  return { ok: true, exitTimeLimit: exitTimeLimit.toISOString() };
}

function emitLprDetected(dto, result) {
  const data = result.body?.data || {};
  appEvents.emit('lpr_detected', {
    type: 'lpr_detected',
    success: Boolean(result.body?.success),
    action: result.body?.action || null,
    message: result.body?.message || null,
    transactionId: data.transactionId || null,
    plateNo: data.plateNo || dto.plateNo,
    vehicleType: dto.vehicleType,
    cameraId: dto.cameraId,
    gateId: dto.gateId,
    direction: data.direction || dto.direction,
    status: data.status || null,
    exitTimeLimit: data.exitTimeLimit || null,
    capturedAt: data.capturedAt || getCapturedTime(dto).toISOString(),
    emittedAt: new Date().toISOString(),
  });

  return result;
}

// Function รับ DTO จากกล้อง LPR แล้วสร้าง transaction หรือข้าม event ซ้ำในช่วงเวลาสั้น ๆ
async function createTransactionFromCamera(dto) {
  const duplicate = await findDuplicateCameraTransaction(dto, DUPLICATE_WINDOW_MS);
  if (duplicate) {
    return emitLprDetected(dto, {
      statusCode: 200,
      body: toGateResponse(
        duplicate,
        'IGNORE_DUPLICATE',
        'รายการนี้ถูกส่งเข้ามาซ้ำในช่วงเวลาสั้น ๆ',
        true
      ),
    });
  }

  if (dto.direction === 'IN') {
    const activeTransaction = await findOpenTransactionByPlateNo(dto.plateNo);
    if (activeTransaction) {
      return emitLprDetected(dto, {
        statusCode: 200,
        body: toGateResponse(
          activeTransaction,
          'IGNORE_ACTIVE_TRANSACTION',
          'ทะเบียนนี้มีรายการจอดที่ยังไม่เสร็จสิ้นอยู่แล้ว',
          true,
          dto.direction
        ),
      });
    }
  }

  if (dto.direction === 'OUT') {
    const activeTransaction = await findOpenTransactionByPlateNo(dto.plateNo);
    const capturedTime = getCapturedTime(dto);
    const eligibility = validateExitEligibility(activeTransaction, capturedTime);

    if (!eligibility.ok) {
      return emitLprDetected(dto, {
        statusCode: 200,
        body: toGateResponse(
          activeTransaction || { id: null, plateNo: dto.plateNo, status: 'not_found', receipt: { camera: { direction: dto.direction } } },
          eligibility.action,
          eligibility.message,
          false,
          dto.direction,
          {
            exitTimeLimit: eligibility.exitTimeLimit || null,
            capturedAt: capturedTime.toISOString(),
          }
        ),
      });
    }
  }

  const transaction = await createCameraTransaction({ ...dto, status: 'pending' });

  return emitLprDetected(dto, {
    statusCode: 201,
    body: toGateResponse(transaction, 'OPEN_GATE', 'บันทึกรายการจากกล้องสำเร็จ', true),
  });
}

module.exports = {
  createTransactionFromCamera,
};
