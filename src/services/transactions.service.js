const {
  createCameraTransaction,
  findDuplicateCameraTransaction,
  findOpenTransactionByPlateNo,
} = require('../data/repositories/transactions.repo');

const DUPLICATE_WINDOW_MS = 10 * 1000;

// Function สร้าง response มาตรฐานสำหรับ gate/camera integration
function toGateResponse(transaction, action, message, success, direction = transaction.receipt?.camera?.direction) {
  return {
    success,
    action,
    message,
    data: {
      transactionId: transaction.id,
      plateNo: transaction.plateNo,
      direction,
      status: transaction.status,
    },
  };
}

// Function รับ DTO จากกล้อง LPR แล้วสร้าง transaction หรือข้าม event ซ้ำในช่วงเวลาสั้น ๆ
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

  if (dto.direction === 'IN') {
    const activeTransaction = await findOpenTransactionByPlateNo(dto.plateNo);
    if (activeTransaction) {
      return {
        statusCode: 200,
        body: toGateResponse(
          activeTransaction,
          'IGNORE_ACTIVE_TRANSACTION',
          'ทะเบียนนี้มีรายการจอดที่ยังไม่เสร็จสิ้นอยู่แล้ว',
          true,
          dto.direction
        ),
      };
    }
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
