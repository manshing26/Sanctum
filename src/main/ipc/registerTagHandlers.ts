import { ipcMain } from 'electron';
import type {
  AssignItemTagInput,
  AssignItemsTagInput,
  CreateTagInput,
  RenameTagInput,
  UpdateTagColorInput,
  UnassignItemTagInput,
  UnassignItemsTagInput,
} from '../../shared/ipc';
import { IPC_CHANNELS } from '../../shared/ipc';
import { TagService } from '../services/tag/TagService';

type RegisterTagHandlersParams = {
  tagService: TagService;
};

export const registerTagHandlers = ({ tagService }: RegisterTagHandlersParams): void => {
  ipcMain.handle(IPC_CHANNELS.createTag, (_event, input: CreateTagInput) => {
    try {
      return {
        ok: true as const,
        data: tagService.createTag(input),
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to create tag.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.listTags, () => {
    try {
      return {
        ok: true as const,
        data: tagService.listTags(),
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to list tags.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.renameTag, (_event, input: RenameTagInput) => {
    try {
      return {
        ok: true as const,
        data: tagService.renameTag(input),
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to rename tag.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.updateTagColor, (_event, input: UpdateTagColorInput) => {
    try {
      return {
        ok: true as const,
        data: tagService.updateTagColor(input),
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to update tag color.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.deleteTag, (_event, tagId: number) => {
    try {
      tagService.deleteTag(tagId);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to delete tag.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.assignItemTag, (_event, input: AssignItemTagInput) => {
    try {
      tagService.assignItemTag(input);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to assign tag.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.unassignItemTag, (_event, input: UnassignItemTagInput) => {
    try {
      tagService.unassignItemTag(input);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to unassign tag.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.assignItemsTag, (_event, input: AssignItemsTagInput) => {
    try {
      tagService.assignItemsTag(input);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to assign tags.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.unassignItemsTag, (_event, input: UnassignItemsTagInput) => {
    try {
      tagService.unassignItemsTag(input);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to unassign tags.',
      };
    }
  });
};
