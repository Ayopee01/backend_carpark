const {
  createCameraTransaction,
  findDuplicateCameraTransaction,
  hasKnownVehicleByPlateNo,
} = require('../data/repositories/transactions.repo');

const DUPLICATE_WINDOW_MS = 10 * 1000;

function toGateResponse(transaction, action, message, success) {
  return {
    success,
    action,
    message,
    data: {
      transactionId: transaction.id,
      plateNo: transaction.plateNo,
      direction: transaction.receipt?.camera?.direction,
      status: transaction.status,
      ...(transaction.status === 'DENIED' ? { reason: transaction.receipt?.camera?.reason || 'VEHICLE_NOT_FOUND' } : {}),
    },
  };
}

async function createTransactionFromCamera(dto) {
  const duplicate = await findDuplicateCameraTransaction(dto, DUPLICATE_WINDOW_MS);
  if (duplicate) {
    return {
      statusCode: 200,
      body: toGateResponse(
        duplicate,
        'IGNORE_DUPLICATE',
        'รายการนี้ถูกส่งเข้ามาซ้ำในช่วงเวลาสั้น ๆ',
        true
      ),
    };
  }

  const isKnownVehicle = await hasKnownVehicleByPlateNo(dto.plateNo);
  const status = isKnownVehicle ? 'ALLOWED' : 'DENIED';
  const reason = isKnownVehicle ? undefined : 'VEHICLE_NOT_FOUND';
  const transaction = await createCameraTransaction({ ...dto, status, reason });

  if (isKnownVehicle) {
    return {
      statusCode: 201,
      body: toGateResponse(transaction, 'OPEN_GATE', 'อนุญาตให้ผ่าน', true),
    };
  }

  return {
    statusCode: 201,
    body: toGateResponse(transaction, 'DENY', 'ไม่พบทะเบียนในระบบ', false),
  };
}

module.exports = {
  createTransactionFromCamera,
};
