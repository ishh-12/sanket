export default function errorHandler(err, req, res, next) {
  // Body-parser JSON syntax errors -> 400, not 500.
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({
      success: false,
      error: 'Malformed JSON payload',
      code: 'INVALID_JSON',
    });
  }

  console.error('Error:', err);

  const status = err.status || err.statusCode || 500;
  const message = status >= 500 ? (err.message || 'Internal Server Error') : err.message;

  res.status(status).json({
    success: false,
    error: message,
    code: err.code || 'INTERNAL_ERROR',
  });
}
