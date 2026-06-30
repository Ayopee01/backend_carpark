const {
  createCameraTransaction,
  findDuplicateCameraTransaction,
  findOpenTransactionByPlateNo,
  getTransactionApiById,
} = require('../data/repositories/transactions.repo');
const appEvents = require('../utils/events');

// Constant เวลากัน event กล้องซ้ำ
const DUPLICATE_WINDOW_MS = 10 * 1000;
const PAYMENT_REQUIRED_STATUSES = new Set(['pending', 'partially_paid']);
const PAYMENT_REQUIRED_MESSAGES = {
  pending: 'รายการนี้ยังชำระเงินไม่ครบ กรุณาชำระเงินก่อนออก',
  partially_paid: 'หมดเวลาออกหลังชำระเงินแล้ว กรุณาชำระเงินใหม่ก่อนออก',
};

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

// Function อ่านเวลาที่กล้องจับภาพจาก DTO
function getCapturedTime(dto) {
  const capturedTime = dto.capturedAt ? new Date(dto.capturedAt) : new Date();
  return Number.isNaN(capturedTime.getTime()) ? new Date() : capturedTime;
}

// Function อ่าน exitTimeLimit ของ transaction
function getExitTimeLimit(transaction) {
  if (!transaction?.exitTimeLimit) return null;
  const exitTimeLimit = new Date(transaction.exitTimeLimit);
  return Number.isNaN(exitTimeLimit.getTime()) ? null : exitTimeLimit;
}

// Function ตรวจว่า transaction ออกได้หรือยังต้องจ่ายเพิ่ม
function validateExitEligibility(transaction, capturedTime, checkedAt = new Date()) {
  if (!transaction) {
    return { ok: false, action: 'TRANSACTION_NOT_FOUND', message: 'ไม่พบรายการจอดที่ยังเปิดอยู่' };
  }

  if (PAYMENT_REQUIRED_STATUSES.has(transaction.status)) {
    return {
      ok: false,
      action: 'PAYMENT_REQUIRED',
      message: PAYMENT_REQUIRED_MESSAGES[transaction.status],
      paymentRequired: true,
      reason: transaction.status,
    };
  }

  if (transaction.status !== 'paid_waiting_exit') {
    return {
      ok: false,
      action: 'PAYMENT_REQUIRED',
      message: 'รายการนี้ยังไม่พร้อมออก กรุณาตรวจสอบสถานะการชำระเงิน',
      paymentRequired: true,
      reason: transaction.status,
    };
  }

  const remainingAmount = Number(transaction.remainingAmount ?? 0);
  if (Number.isFinite(remainingAmount) && remainingAmount > 0) {
    return {
      ok: false,
      action: 'PAYMENT_REQUIRED',
      message: 'รายการนี้ยังชำระเงินไม่ครบ กรุณาชำระเงินก่อนออก',
      paymentRequired: true,
      reason: 'remaining_amount',
      remainingAmount,
    };
  }

  const exitTimeLimit = getExitTimeLimit(transaction);
  if (!exitTimeLimit || checkedAt > exitTimeLimit) {
    return {
      ok: false,
      action: 'PAYMENT_REQUIRED',
      message: 'หมดเวลาออกหลังชำระเงินแล้ว กรุณาชำระเงินใหม่ก่อนออก',
      paymentRequired: true,
      reason: 'exit_window_expired',
      exitTimeLimit: exitTimeLimit ? exitTimeLimit.toISOString() : null,
    };
  }

  return { ok: true, exitTimeLimit: exitTimeLimit.toISOString() };
}

// Function emit event LPR ไปยัง client SSE
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
    const activeRow = await findOpenTransactionByPlateNo(dto.plateNo);
    const activeTransaction = activeRow ? await getTransactionApiById(activeRow.id) : null;
    const capturedTime = getCapturedTime(dto);
    const checkedAt = new Date();
    const eligibility = validateExitEligibility(activeTransaction, capturedTime, checkedAt);

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
            checkedAt: checkedAt.toISOString(),
            paymentRequired: Boolean(eligibility.paymentRequired),
            reason: eligibility.reason || null,
            remainingAmount: eligibility.remainingAmount ?? activeTransaction?.remainingAmount ?? null,
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

// Export Functions
module.exports = {
  createTransactionFromCamera,
};
