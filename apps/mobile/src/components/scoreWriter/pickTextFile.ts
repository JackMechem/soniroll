import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

/**
 * Opens the system file picker and reads the chosen file as text — Score Writer's and the bass
 * players' Import (a score or transcription .json, or MusicXML). `null` if cancelled. Compressed
 * MusicXML (.mxl) is a zip, which the phone can't open (the website unzips it with the browser's
 * own `DecompressionStream`), so it's refused with a way round.
 */
export async function pickTextFile(types: string[]): Promise<{ name: string; text: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  if (/\.mxl$/i.test(asset.name)) {
    throw new Error('Compressed MusicXML (.mxl) can’t be opened on the phone. Export it as uncompressed MusicXML (.musicxml), or import it on soniroll.com.');
  }
  const text = await new File(asset.uri).text();
  return { name: asset.name, text };
}
