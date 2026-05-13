import fs from 'node:fs/promises';
import path from 'node:path';
import { dialog, ipcMain, shell } from 'electron';
import {
  IPC_CHANNELS,
  type AssignNoteFolderInput,
  type AssignNotesFolderInput,
  type AssignNoteTagInput,
  type AssignNotesTagInput,
  type CreateNoteInput,
  type DeleteNoteInput,
  type ExportNoteInput,
  type UnassignNoteTagInput,
  type UnassignNotesTagInput,
  type UpdateNoteInput,
} from '../../shared/ipc';
import { NoteService } from '../services/note/NoteService';
import { MainWindowController } from '../windows/MainWindowController';

type RegisterNoteHandlersParams = {
  noteService: NoteService;
  mainWindowController: MainWindowController;
};

const RISK_MARKERS = ['.git', 'package.json', 'tsconfig.json', 'vite.config.ts', 'webpack.config.js'];

const sanitizeFilename = (value: string, fallback: string): string => {
  const cleaned = value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
};

const isRiskyExportTarget = async (targetDir: string): Promise<boolean> => {
  for (const marker of RISK_MARKERS) {
    try {
      await fs.access(path.join(targetDir, marker));
      return true;
    } catch {
      // marker absent
    }
  }
  return false;
};

const confirmRiskyExportTarget = async (targetDir: string, mainWindowController: MainWindowController): Promise<boolean> => {
  if (!(await isRiskyExportTarget(targetDir))) return true;
  const parent = mainWindowController.getWindow();
  const result = parent
    ? await dialog.showMessageBox(parent, {
        type: 'warning',
        buttons: ['Cancel', 'Export plaintext'],
        defaultId: 0,
        cancelId: 0,
        title: 'Export plaintext note?',
        message: 'This folder looks like a project workspace.',
        detail: 'Exported notes are decrypted plaintext. Choose another folder if this workspace may be shared with tools, source control, or AI agents.',
      })
    : await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Cancel', 'Export plaintext'],
        defaultId: 0,
        cancelId: 0,
        title: 'Export plaintext note?',
        message: 'This folder looks like a project workspace.',
        detail: 'Exported notes are decrypted plaintext. Choose another folder if this workspace may be shared with tools, source control, or AI agents.',
      });
  return result.response === 1;
};

const resolveExportDir = async (input: ExportNoteInput, mainWindowController: MainWindowController): Promise<string | null> => {
  if (input.targetDir?.trim()) return input.targetDir;
  const parent = mainWindowController.getWindow();
  const result = parent
    ? await dialog.showOpenDialog(parent, { properties: ['openDirectory', 'createDirectory'] })
    : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
};

export const registerNoteHandlers = ({
  noteService,
  mainWindowController,
}: RegisterNoteHandlersParams): void => {
  ipcMain.handle(IPC_CHANNELS.listNotes, () => {
    try {
      return { ok: true as const, data: noteService.listNotes() };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to list notes.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.createNote, (_event, input: CreateNoteInput) => {
    try {
      return { ok: true as const, data: noteService.createNote(input) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to create note.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.updateNote, (_event, input: UpdateNoteInput) => {
    try {
      return { ok: true as const, data: noteService.updateNote(input) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to update note.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.deleteNote, (_event, input: DeleteNoteInput) => {
    try {
      noteService.deleteNote(input.id);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to delete note.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.assignNoteFolder, (_event, input: AssignNoteFolderInput) => {
    try {
      noteService.assignNoteFolder(input);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to assign folder.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.assignNotesFolder, (_event, input: AssignNotesFolderInput) => {
    try {
      noteService.assignNotesFolder(input);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to assign folder.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.assignNoteTag, (_event, input: AssignNoteTagInput) => {
    try {
      noteService.assignNoteTag(input);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to assign tag.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.unassignNoteTag, (_event, input: UnassignNoteTagInput) => {
    try {
      noteService.unassignNoteTag(input);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to unassign tag.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.assignNotesTag, (_event, input: AssignNotesTagInput) => {
    try {
      noteService.assignNotesTag(input);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to assign tags.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.unassignNotesTag, (_event, input: UnassignNotesTagInput) => {
    try {
      noteService.unassignNotesTag(input);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to unassign tags.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.exportNote, async (_event, input: ExportNoteInput) => {
    try {
      const note = noteService.getNote(input.id);
      const targetDir = await resolveExportDir(input, mainWindowController);
      if (!targetDir) return { ok: false as const, error: 'Export cancelled.' };
      if (!(await confirmRiskyExportTarget(targetDir, mainWindowController))) {
        return { ok: false as const, error: 'Export cancelled.' };
      }
      const extension = note.format === 'markdown' ? '.md' : '.txt';
      const outputPath = path.join(targetDir, `${sanitizeFilename(note.title, 'secure-note')}${extension}`);
      await fs.writeFile(outputPath, note.body, 'utf8');
      await shell.showItemInFolder(outputPath);
      return { ok: true as const, data: { path: outputPath } };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to export note.' };
    }
  });
};
