const { toCameraTransactionDto } = require('../dto/transactions.dto');

function pushRequiredStringError(errors, payload, field) {
  if (payload[field] === undefined || payload[field] === null || typeof payload[field] !== 'string' || payload[field].trim() === '') {
    errors.push({ field, message: `${field} is required` });
  }
}

function validateCameraTransactionPayload(payload = {}) {
  const errors = [];

  pushRequiredStringError(errors, payload, 'plateNo');
  pushRequiredStringError(errors, payload, 'cameraId');
  pushRequiredStringError(errors, payload, 'gateId');
  pushRequiredStringError(errors, payload, 'direction');

  if (typeof payload.direction === 'string' && payload.direction.trim() && !['IN', 'OUT'].includes(payload.direction.trim().toUpperCase())) {
    errors.push({ field: 'direction', message: 'direction must be IN or OUT' });
  }

  if (payload.capturedAt !== undefined && payload.capturedAt !== null && Number.isNaN(new Date(payload.capturedAt).getTime())) {
    errors.push({ field: 'capturedAt', message: 'capturedAt must be a valid date time' });
  }

  if (payload.confidence !== undefined && payload.confidence !== null && !Number.isFinite(Number(payload.confidence))) {
    errors.push({ field: 'confidence', message: 'confidence must be a number' });
  }

  if (payload.imageUrl !== undefined && payload.imageUrl !== null && typeof payload.imageUrl !== 'string') {
    errors.push({ field: 'imageUrl', message: 'imageUrl must be a string' });
  }

  if (errors.length) return { valid: false, errors };

  return {
    valid: true,
    dto: toCameraTransactionDto(payload),
  };
}

module.exports = {
  validateCameraTransactionPayload,
};
