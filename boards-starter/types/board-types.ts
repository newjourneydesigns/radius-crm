// GSD Board — Extracted type definitions
// Replace with your own ORM types or API response shapes as needed.

export type CardPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ProjectBoard {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  notes: string | null;
  is_public: boolean;
}

export interface BoardColumn {
  id: string;
  board_id: string;
  title: string;
  position: number;
  created_at: string;
}

export interface BoardLabel {
  id: string;
  board_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface BoardCard {
  id: string;
  column_id: string;
  board_id: string;
  title: string;
  description: string | null;
  position: number;
  priority: CardPriority | null;
  due_date: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface CardLabelAssignment {
  id: string;
  card_id: string;
  label_id: string;
  created_at: string;
}

export interface CardComment {
  id: string;
  card_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface CardChecklist {
  id: string;
  card_id: string;
  title: string;
  is_completed: boolean;
  position: number;
  created_at: string;
}

export interface ChecklistTemplate {
  id: string;
  user_id: string;
  board_id: string;
  name: string;
  items: string[];
  created_at: string;
}
