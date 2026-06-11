'use client';

import { useEffect } from 'react';
import { useProjectBoard } from '../../hooks/useProjectBoard';
import { CardDetailModal } from '../boards/CardDetailModal';
import { kanbanStyles } from '../boards/kanbanStyles';

/**
 * Hosts the full board CardDetailModal outside the board page.
 * Loads the card's board on demand so editing a card from the Today page
 * behaves exactly like opening it on its board.
 */
export default function TodayCardModal({
  boardId,
  cardId,
  onClose,
}: {
  boardId: string;
  cardId: string;
  onClose: (didChange: boolean) => void;
}) {
  const {
    board, fetchBoard, checklistTemplates, fetchChecklistTemplates,
    updateCard, deleteCard, moveCard, moveToBoardCard, addCard,
    addComment, updateComment, deleteComment,
    addChecklistItem, toggleChecklistItem, updateChecklistItemDueDate,
    deleteChecklistItem, renameChecklistItem, updateChecklistItemUrl, reorderChecklistItems,
    promoteUngroupedToGroup, addChecklistGroup, renameChecklistGroup, deleteChecklistGroup,
    saveChecklistTemplate, deleteChecklistTemplate, applyChecklistTemplate,
    assignCard, unassignCard, fetchSystemUsers,
  } = useProjectBoard();

  useEffect(() => {
    fetchBoard(boardId);
    fetchChecklistTemplates(boardId);
  }, [boardId, fetchBoard, fetchChecklistTemplates]);

  const card = board?.cards.find(c => c.id === cardId) || null;

  if (!board || !card) {
    return (
      <div
        onClick={() => onClose(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(6,8,12,0.72)', backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.12)', borderTopColor: '#33B233',
          animation: 'today-modal-spin 0.9s linear infinite',
        }} />
        <style>{`@keyframes today-modal-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <>
      <style>{kanbanStyles}</style>
      <CardDetailModal
        card={card}
        board={board}
        onClose={() => onClose(true)}
        onUpdate={async (updates) => {
          const cardBeforeUpdate = board.cards.find(c => c.id === card.id);
          await updateCard(boardId, card.id, updates);
          if (updates.is_complete === true && cardBeforeUpdate) {
            const col = board.columns.find(c => c.id === cardBeforeUpdate.column_id);
            const moveAction = col?.automations?.find(a => a.type === 'move_completed');
            if (moveAction?.type === 'move_completed') {
              await moveCard(boardId, card.id, moveAction.value, 0);
            }
          }
        }}
        onDelete={async () => { await deleteCard(boardId, card.id); onClose(true); }}
        onAddComment={async (content) => { await addComment(boardId, card.id, content); }}
        onUpdateComment={async (commentId, content) => { await updateComment(boardId, card.id, commentId, content); }}
        onDeleteComment={async (commentId) => { await deleteComment(boardId, card.id, commentId); }}
        onAddChecklistItem={async (title, groupId) => { await addChecklistItem(boardId, card.id, title, groupId); }}
        onToggleChecklistItem={async (itemId, val) => { await toggleChecklistItem(boardId, card.id, itemId, val); }}
        onUpdateChecklistDueDate={async (itemId, dueDate) => { await updateChecklistItemDueDate(boardId, card.id, itemId, dueDate); }}
        onRenameChecklistItem={async (itemId, title) => { await renameChecklistItem(boardId, card.id, itemId, title); }}
        onUpdateChecklistItemUrl={async (itemId, url) => { await updateChecklistItemUrl(boardId, card.id, itemId, url); }}
        onReorderChecklistItems={async (orderedItemIds) => { await reorderChecklistItems(boardId, card.id, orderedItemIds); }}
        onDeleteChecklistItem={async (itemId) => { await deleteChecklistItem(boardId, card.id, itemId); }}
        onPromoteUngrouped={async (title) => await promoteUngroupedToGroup(boardId, card.id, title)}
        onAddChecklistGroup={async (title) => await addChecklistGroup(boardId, card.id, title)}
        onRenameChecklistGroup={async (groupId, title) => { await renameChecklistGroup(boardId, card.id, groupId, title); }}
        onDeleteChecklistGroup={async (groupId) => { await deleteChecklistGroup(boardId, card.id, groupId); }}
        onConvertToCard={async (itemId, title, columnId) => {
          await addCard(boardId, { column_id: columnId, title });
          await deleteChecklistItem(boardId, card.id, itemId);
        }}
        onMoveCard={async (newColumnId) => { await moveCard(boardId, card.id, newColumnId, 0); }}
        onMoveToBoardCard={async (targetBoardId, targetColumnId) => {
          await moveToBoardCard(card.id, targetBoardId, targetColumnId);
          onClose(true);
        }}
        checklistTemplates={checklistTemplates}
        onSaveTemplate={async (name, items) => { await saveChecklistTemplate(boardId, name, items); }}
        onDeleteTemplate={async (templateId) => { await deleteChecklistTemplate(templateId); }}
        onApplyTemplate={async (templateId) => { await applyChecklistTemplate(boardId, card.id, templateId); }}
        onAssignCard={async (userId) => { await assignCard(card.id, userId); }}
        onUnassignCard={async (userId) => { await unassignCard(card.id, userId); }}
        fetchSystemUsers={fetchSystemUsers}
        onDuplicate={async () => {
          const newCard = await addCard(boardId, {
            column_id: card.column_id,
            title: card.title + ' (copy)',
            description: card.description || undefined,
            priority: card.priority,
            start_date: card.start_date || undefined,
            due_date: card.due_date || undefined,
            due_time: card.due_time || null,
            label_ids: (card.labels || []).map(l => l.id),
          });
          if (newCard && card.checklists?.length) {
            for (const item of card.checklists) {
              await addChecklistItem(boardId, newCard.id, item.title);
            }
          }
        }}
      />
    </>
  );
}
