/**
 * Sample Attachment Generator for Demo Mode
 *
 * In demo mode, pre-loaded attachments do not carry large physical binary assets.
 * When a user downloads a demo sample attachment, this utility synthesizes a valid,
 * minimal file (PNG/JPEG or one-page PDF) using the original filename and MIME type
 * so the operating system and browser viewer can open it normally.
 */

/**
 * Creates a synthetic demo sample file as a Blob.
 * @param {string} fileName
 * @param {string} mimeType
 * @returns {Promise<Blob>}
 */
export async function makeSampleFile(fileName, mimeType) {
  if (mimeType === "application/pdf") {
    return new Blob([generateSamplePdfContent(fileName)], { type: "application/pdf" });
  }

  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 450;
  const context = canvas.getContext("2d");

  // Background canvas container
  context.fillStyle = "#eef3fb";
  context.fillRect(0, 0, 800, 450);

  // Attachment title text
  context.fillStyle = "#0b3d91";
  context.font = "bold 30px sans-serif";
  context.fillText(fileName, 40, 210);

  // Subtitle explaining origin
  context.fillStyle = "#4a5875";
  context.font = "20px sans-serif";
  context.fillText("Sample file from the 10X CRM demo", 40, 256);

  const imageOutputFormat = mimeType === "image/png" ? "image/png" : "image/jpeg";
  return new Promise(resolve => canvas.toBlob(resolve, imageOutputFormat, 0.9));
}

/**
 * Synthesizes a valid one-page minimal PDF 1.4 document containing the requested file name.
 * @param {string} fileName
 * @returns {string} Raw PDF binary string
 */
function generateSamplePdfContent(fileName) {
  const sanitizedText = String(fileName || "sample").replace(/[()\\]/g, "");

  const pdfObjects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    null, // Object 4: Stream placeholder
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];

  const streamContent = `BT /F1 20 Tf 60 760 Td (${sanitizedText}) Tj 0 -30 Td /F1 12 Tf (Sample file from the 10X CRM demo) Tj ET`;
  pdfObjects[3] = `<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`;

  let pdfString = "%PDF-1.4\n";
  const byteOffsets = pdfObjects.map((objectBody, index) => {
    const objectOffset = pdfString.length;
    pdfString += `${index + 1} 0 obj\n${objectBody}\nendobj\n`;
    return objectOffset;
  });

  const xrefOffset = pdfString.length;
  pdfString += `xref\n0 ${pdfObjects.length + 1}\n0000000000 65535 f \n`;
  pdfString += byteOffsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdfString += `trailer\n<< /Size ${pdfObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return pdfString;
}
