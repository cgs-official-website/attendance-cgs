import zunaLogo from "../assets/zuna-logo.png";

export const addStandardPDFHeader = async (doc, titleText, subtitleText, isLandscape = false) => {
  const pageWidth = doc.internal.pageSize.getWidth();

  // 1. Draw Carrezza Logo (Blue circle with white checkmark) - Top Left
  doc.setFillColor(0, 97, 224); // Brand Primary Blue
  doc.circle(20, 16, 7, 'F');
  
  // White checkmark inside circle
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.8);
  doc.line(17.5, 16.5, 19.5, 18.5);
  doc.line(19.5, 18.5, 23.5, 13.5);
  
  // 2. Carrezza Company Name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 97, 224); // Brand Primary Blue
  doc.text("Carrezza Global Solutions Pvt Ltd", 34, 16);
  
  // 3. Load Zuna Logo and draw it on the Top Right
  const img = new Image();
  img.src = zunaLogo;
  await new Promise((resolve) => {
    img.onload = resolve;
    img.onerror = resolve; 
  });

  if (img.complete && img.naturalWidth > 0) {
    const logoWidth = 20;
    const logoHeight = logoWidth * (img.naturalHeight / img.naturalWidth);
    const logoX = pageWidth - logoWidth - 14; 
    doc.addImage(img, 'PNG', logoX, 8, logoWidth, logoHeight);
    
    // Add "Powered by Zuna" text below the logo
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(150, 150, 150);
    doc.text("Powered by Zuna", logoX, 8 + logoHeight + 4);
  }

  // 4. Draw Title and Subtitle Below Logos
  let currentY = 32;
  
  if (titleText) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59); // Slate-800
    doc.text(titleText, 14, currentY);
    currentY += 6;
  }
  
  if (subtitleText) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105); // Slate-500
    doc.text(subtitleText, 14, currentY);
    currentY += 6;
  }

  // 5. Draw a separator line
  doc.setDrawColor(226, 232, 240); // Slate-200
  doc.setLineWidth(0.5);
  doc.line(14, currentY, pageWidth - 14, currentY);
  
  // Return the Y coordinate where the table should start
  return currentY + 6;
};
