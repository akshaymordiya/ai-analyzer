import clipboardy from 'clipboardy';
export async function copyToClipboard(text) {
    await clipboardy.write(text);
}
