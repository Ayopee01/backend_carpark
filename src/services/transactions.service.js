const {
  createCameraTransaction,
  findDuplicateCameraTransaction,
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

  const transaction = await createCameraTransaction({ ...dto, status: 'pending' });

  return {
    statusCode: 201,
    body: toGateResponse(transaction, 'OPEN_GATE', 'บันทึกรายการจากกล้องสำเร็จ', true),
  };
}

module.exports = {
  createTransactionFromCamera,
};
