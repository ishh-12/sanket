export async function generatePrediction(data) {
  return {
    prediction: 'stable',
    confidence: 0.84,
    input: data,
  };
}
