// Browser-only glue around pdf.js (loaded globally via CDN script tag in
// index.html, see the `pdfjsLib` global). Not unit-tested for the same reason
// dataLoader.js isn't — it's a thin wrapper around a browser API, with the
// actual parsing logic (statementParser.js) kept pure and tested separately.

const PDFJS_VERSION = '3.11.174';

let workerConfigured = false;

function configureWorker() {
  if (workerConfigured) return;
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
  workerConfigured = true;
}

/**
 * Extracts all text from a PDF file, page by page, in reading order.
 * `arrayBuffer` is the raw file contents (e.g. from File#arrayBuffer()).
 */
export async function extractTextFromPdf(arrayBuffer) {
  configureWorker();
  const doc = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    fullText += content.items.map((item) => item.str).join(' ') + '\n';
  }
  return fullText;
}
