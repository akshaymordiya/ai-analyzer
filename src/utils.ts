import clipboardy from 'clipboardy';

export async function copyToClipboard(text: string) {
  await clipboardy.write(text);
}