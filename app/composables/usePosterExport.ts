// Downloading a poster as a PNG from the editor, and opening its print page.

/** A file name from the poster's name: "Smash Bros!" gives "smash-bros.png". */
export function posterFileName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'poster'}.png`;
}

export function usePosterExport() {
  const { t } = useI18n();
  const toast = useToast();
  const exporting = ref(false);

  async function downloadPng(make: () => Promise<Blob>, name: string) {
    exporting.value = true;
    try {
      const url = URL.createObjectURL(await make());
      const link = document.createElement('a');
      link.href = url;
      link.download = posterFileName(name);
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 10_000);
    } catch (error) {
      console.error('Unable to make the poster PNG', error);
      toast.add({
        title: t('admin.posters.pngFailed'),
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
    } finally {
      exporting.value = false;
    }
  }

  return { exporting, downloadPng };
}
