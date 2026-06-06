/* Driver Flux PDF fallback.
   Se a biblioteca oficial jsPDF carregar pela internet, este arquivo não interfere.
   Se não carregar, fornece uma implementação mínima compatível com window.jspdf.jsPDF
   para gerar PDF real com texto paginado. */
(function(){
  if (window.jspdf && window.jspdf.jsPDF) return;

  function escapePdfText(s) {
    // PDF Unicode text string em UTF-16BE hexadecimal com BOM.
    const str = String(s == null ? '' : s);
    const bytes = [0xFE, 0xFF];
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      bytes.push((code >> 8) & 0xff, code & 0xff);
    }
    return '<' + bytes.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase() + '>';
  }

  function pdfEscapeName(s) {
    return String(s || '').replace(/[^A-Za-z0-9_\-]/g, '_');
  }

  function MiniJsPDF(opts) {
    opts = opts || {};
    this.unit = opts.unit || 'pt';
    this.format = opts.format || 'a4';
    this.orientation = opts.orientation || 'p';
    this.pageWidth = this.orientation === 'l' ? 841.89 : 595.28;
    this.pageHeight = this.orientation === 'l' ? 595.28 : 841.89;
    this.fontSize = 11;
    this.pages = [[]];
    this.internal = { pageSize: { getWidth: () => this.pageWidth, getHeight: () => this.pageHeight } };
  }

  MiniJsPDF.prototype.setFont = function(){ return this; };
  MiniJsPDF.prototype.setFontSize = function(size){ this.fontSize = Number(size) || this.fontSize; return this; };
  MiniJsPDF.prototype.addPage = function(){ this.pages.push([]); return this; };
  MiniJsPDF.prototype.text = function(txt, x, y){
    const lines = Array.isArray(txt) ? txt : String(txt == null ? '' : txt).split(/\r?\n/);
    const page = this.pages[this.pages.length - 1];
    for (let i = 0; i < lines.length; i++) {
      page.push({ text: String(lines[i]), x: Number(x) || 0, y: (Number(y) || 0) + i * (this.fontSize + 3), size: this.fontSize });
    }
    return this;
  };
  MiniJsPDF.prototype.splitTextToSize = function(text, maxWidth){
    const str = String(text == null ? '' : text).replace(/\t/g, '    ');
    const avgChar = Math.max(4, this.fontSize * 0.52);
    const maxChars = Math.max(12, Math.floor((Number(maxWidth) || 500) / avgChar));
    const out = [];
    str.split(/\r?\n/).forEach(par => {
      let line = '';
      par.split(/\s+/).forEach(word => {
        if (!word) return;
        if ((line + ' ' + word).trim().length > maxChars) {
          if (line) out.push(line);
          while (word.length > maxChars) {
            out.push(word.slice(0, maxChars));
            word = word.slice(maxChars);
          }
          line = word;
        } else {
          line = (line ? line + ' ' : '') + word;
        }
      });
      out.push(line || '');
    });
    return out;
  };

  MiniJsPDF.prototype.output = function(type){
    const objects = [];
    const addObj = body => { objects.push(body); return objects.length; };
    const catalogId = 1, pagesId = 2;
    objects.push('');
    objects.push('');
    const fontId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const pageIds = [];
    const contentIds = [];

    this.pages.forEach(pageLines => {
      let stream = 'BT\n/F1 11 Tf\n';
      pageLines.forEach(item => {
        const size = Number(item.size) || 11;
        const x = Number(item.x) || 0;
        const y = this.pageHeight - (Number(item.y) || 0);
        stream += `/F1 ${size.toFixed(2)} Tf\n1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm\n${escapePdfText(item.text)} Tj\n`;
      });
      stream += 'ET\n';
      const contentId = addObj('<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream');
      const pageId = addObj('<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + this.pageWidth + ' ' + this.pageHeight + '] /Resources << /Font << /F1 ' + fontId + ' 0 R >> >> /Contents ' + contentId + ' 0 R >>');
      pageIds.push(pageId); contentIds.push(contentId);
    });

    objects[catalogId - 1] = '<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>';
    objects[pagesId - 1] = '<< /Type /Pages /Kids [' + pageIds.map(id => id + ' 0 R').join(' ') + '] /Count ' + pageIds.length + ' >>';

    let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets = [0];
    objects.forEach((body, idx) => {
      offsets.push(pdf.length);
      pdf += (idx + 1) + ' 0 obj\n' + body + '\nendobj\n';
    });
    const xref = pdf.length;
    pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
    for (let i = 1; i <= objects.length; i++) pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root ' + catalogId + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF';

    const blob = new Blob([pdf], { type: 'application/pdf' });
    if (type === 'blob') return blob;
    if (type === 'arraybuffer') return blob.arrayBuffer();
    return pdf;
  };

  window.jspdf = { jsPDF: MiniJsPDF };
})();
