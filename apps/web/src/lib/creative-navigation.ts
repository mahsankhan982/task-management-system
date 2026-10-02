type Board = { id: number | string; name: string; parent_board_id?: number | string | null };
type Stage = { id: number | string; board_id?: number | string; name: string; is_system?: boolean; is_archived?: boolean };
export type CreativeNavigationOption = { key: string; name: string; href: string };
const coreNames = new Set(['To Do', 'In Progress', 'Waiting for Review', 'Review', 'Waiting for Lead', 'For Posting', 'Completed']);
export function creativeNavigationOptions(boards: Board[], stages: Stage[]): CreativeNavigationOption[] {
  const root = boards.find(board => !board.parent_board_id && ['creative', 'creative board'].includes(board.name.trim().toLowerCase()));
  if (!root) return [];
  const children = boards.filter(board => Number(board.parent_board_id) === Number(root.id));
  return [
    ...children.map(board => ({ key: 'board:' + board.id, name: board.name, href: '/dashboard/boards?boardId=' + board.id })),
    ...stages.filter(stage => !stage.is_archived && !stage.is_system && !coreNames.has(stage.name) &&
      (Number(stage.board_id) === Number(root.id) || children.some(board => Number(board.id) === Number(stage.board_id))))
      .map(stage => ({ key: 'list:' + stage.id,
        name: Number(stage.board_id) === Number(root.id) ? stage.name : boards.find(board => Number(board.id) === Number(stage.board_id))?.name + ' / ' + stage.name,
        href: '/dashboard/boards?boardId=' + stage.board_id + '&creativeListId=' + stage.id })),
  ];
}
