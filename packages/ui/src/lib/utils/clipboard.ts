export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    throw new Error('Clipboard API unavailable');
  } catch (err) {
    let textArea: HTMLTextAreaElement | null = null;
    try {
      textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.position = 'fixed';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      return document.execCommand('copy');
    } catch (fallbackErr) {
      console.error('Failed to copy', err, fallbackErr);
      return false;
    } finally {
      if (textArea && textArea.parentNode) {
        document.body.removeChild(textArea);
      }
    }
  }
}
