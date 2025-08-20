'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase, CircleLeader, Note, NoteTemplate } from '../../../lib/supabase';
import { useCircleLeaders } from '../../../hooks/useCircleLeaders';
import { useNoteTemplates } from '../../../hooks/useNoteTemplates';
import { useAuth } from '../../../contexts/AuthContext';
import AlertModal from '../../../components/ui/AlertModal';
import ConfirmModal from '../../../components/ui/ConfirmModal';
import LogConnectionModal from '../../../components/dashboard/LogConnectionModal';
import NoteTemplateModal from '../../../components/dashboard/NoteTemplateModal';
import ProtectedRoute from '../../../components/ProtectedRoute';

// Helper function to format time to AM/PM
const formatTimeToAMPM = (time: string | undefined | null): string => {
  if (!time) return 'Not scheduled';
  
  // If already in AM/PM format, return as is
  if (time.includes('AM') || time.includes('PM')) {
    return time;
  }
  
  // Convert 24-hour format to 12-hour format
  const [hours, minutes] = time.split(':');
  const hour24 = parseInt(hours);
  
  if (hour24 === 0) {
    return `12:${minutes} AM`;
  } else if (hour24 < 12) {
    return `${hour24}:${minutes} AM`;
  } else if (hour24 === 12) {
    return `12:${minutes} PM`;
  } else {
    return `${hour24 - 12}:${minutes} PM`;
  }
};

// Helper function to convert AM/PM time to 24-hour format for HTML time input
const convertAMPMTo24Hour = (time: string | undefined | null): string => {
  if (!time) return '';
  
  // If already in 24-hour format, return as is
  if (!time.includes('AM') && !time.includes('PM')) {
    return time;
  }
  
  const [timePart, period] = time.split(' ');
  const [hours, minutes] = timePart.split(':');
  let hour24 = parseInt(hours);
  
  if (period === 'AM' && hour24 === 12) {
    hour24 = 0;
  } else if (period === 'PM' && hour24 !== 12) {
    hour24 += 12;
  }
  
  return `${hour24.toString().padStart(2, '0')}:${minutes}`;
};

// Helper function to get follow-up date status
const getFollowUpStatus = (dateString: string | undefined | null): { 
  isOverdue: boolean; 
  isApproaching: boolean; 
  daysUntil: number;
} => {
  if (!dateString) return { isOverdue: false, isApproaching: false, daysUntil: 0 };
  
  try {
    // Parse the date as local date to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    const followUpDate = new Date(year, month - 1, day); // month is 0-indexed
    const today = new Date();
    
    // Reset time to compare just dates
    followUpDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    
    const diffTime = followUpDate.getTime() - today.getTime();
    const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return {
      isOverdue: daysUntil < 0,
      isApproaching: daysUntil >= 0 && daysUntil <= 3, // Approaching if within 3 days
      daysUntil
    };
  } catch (error) {
    return { isOverdue: false, isApproaching: false, daysUntil: 0 };
  }
};

// Helper function to format date for display (avoiding timezone issues)
const formatDateForDisplay = (dateString: string | undefined | null): string => {
  if (!dateString) return 'Not set';
  
  try {
    // Parse the date as local date to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long', 
      day: 'numeric'
    });
  } catch (error) {
    return dateString; // Fallback to raw string
  }
};

// Helper function to convert AM/PM time to 24-hour format for input
const convertToMilitaryTime = (time: string | undefined | null): string => {
  if (!time) return '';
  
  // If already in 24-hour format, return as is
  if (!time.includes('AM') && !time.includes('PM')) {
    return time;
  }
  
  const [timePart, period] = time.split(' ');
  const [hours, minutes] = timePart.split(':');
  let hour24 = parseInt(hours);
  
  if (period === 'AM' && hour24 === 12) {
    hour24 = 0;
  } else if (period === 'PM' && hour24 !== 12) {
    hour24 += 12;
  }
  
  return `${hour24.toString().padStart(2, '0')}:${minutes}`;
};

// Helper function to format date and time for display
const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Helper function to convert markdown links to JSX elements (like in dashboard)
const linkifyText = (text: string): (string | JSX.Element)[] => {
  if (!text) return [text];
  
  // Pattern to match markdown-style links: [text](url)
  const markdownLinkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  
  const elements: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match;
  let linkIndex = 0;

  while ((match = markdownLinkPattern.exec(text)) !== null) {
    // Add text before the link
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index));
    }
    
    // Add the link element
    const linkText = match[1];
    const linkUrl = match[2];
    
    // Basic URL validation
    if (linkUrl.startsWith('http://') || linkUrl.startsWith('https://') || linkUrl.startsWith('mailto:')) {
      elements.push(
        <a
          key={`markdown-${linkIndex++}`}
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
        >
          {linkText}
        </a>
      );
    } else {
      // If URL is invalid, just show the original text
      elements.push(match[0]);
    }
    
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return elements.length > 0 ? elements : [text];
};

export default function CircleLeaderProfilePage() {
  const params = useParams();
  const leaderId = params?.id ? parseInt(params.id as string) : 0;
  const { user } = useAuth(); // Get current user information
  const { saveTemplate } = useNoteTemplates(); // Add note templates hook
  
  const [leader, setLeader] = useState<CircleLeader | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdatingEventSummary, setIsUpdatingEventSummary] = useState(false);
  const [isUpdatingFollowUp, setIsUpdatingFollowUp] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState('');
  const [isUpdatingNote, setIsUpdatingNote] = useState(false);
  const [showAlert, setShowAlert] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: ''
  });
  const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null);
  const [isDeletingNote, setIsDeletingNote] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isSavingAsTemplate, setIsSavingAsTemplate] = useState<number | null>(null);
  const [editedLeader, setEditedLeader] = useState<Partial<CircleLeader>>({});
  const [isSavingLeader, setIsSavingLeader] = useState(false);
  const [leaderError, setLeaderError] = useState('');
  const [directors, setDirectors] = useState<Array<{id: number, name: string}>>([]);
  const [showLogConnectionModal, setShowLogConnectionModal] = useState(false);
  
  // Reference data state
  const [campuses, setCampuses] = useState<Array<{id: number, value: string}>>([]);
  const [statuses, setStatuses] = useState<Array<{id: number, value: string}>>([]);
  const [circleTypes, setCircleTypes] = useState<Array<{id: number, value: string}>>([]);
  const [frequencies, setFrequencies] = useState<Array<{id: number, value: string}>>([]);

  useEffect(() => {
    // Load leader data from API
    const loadLeaderData = async () => {
      try {
        // Try to load from Supabase first
        const { data: leaderData, error: leaderError } = await supabase
          .from('circle_leaders')
          .select('*')
          .eq('id', leaderId)
          .single();

        if (leaderData && !leaderError) {
          setLeader(leaderData);
        } else {
          // Fallback to mock data if not found
          setLeader({
            id: leaderId,
            name: 'John Smith',
            email: 'john.smith@email.com',
            phone: '(555) 123-4567',
            campus: 'Downtown',
            acpd: 'Jane Doe',
            status: 'active',
            day: 'Tuesday',
            time: '19:00',
            frequency: 'Weekly',
            circle_type: "Men's",
            event_summary_received: true
          });
        }

        // Load directors from database (ACPDs)
        const { data: directorsData, error: directorsError } = await supabase
          .from('acpd_list')
          .select('id, name')
          .eq('active', true)
          .order('name');

        if (directorsData && !directorsError) {
          setDirectors(directorsData);
        } else {
          // Fallback to mock directors
          setDirectors([
            { id: 1, name: 'Jane Doe' },
            { id: 2, name: 'John Smith' },
            { id: 3, name: 'Trip Ochenski' },
            { id: 4, name: 'Sarah Johnson' },
            { id: 5, name: 'Mike Wilson' }
          ]);
        }

        // Load reference data
        const [campusesResult, statusesResult, circleTypesResult, frequenciesResult] = await Promise.all([
          supabase.from('campuses').select('*').order('value'),
          supabase.from('statuses').select('*').order('value'),
          supabase.from('circle_types').select('*').order('value'),
          supabase.from('frequencies').select('*').order('value')
        ]);

        if (campusesResult.data) setCampuses(campusesResult.data);
        if (statusesResult.data) setStatuses(statusesResult.data);
        if (circleTypesResult.data) setCircleTypes(circleTypesResult.data);
        if (frequenciesResult.data) setFrequencies(frequenciesResult.data);

        // Load notes with user information
        const { data: notesData, error: notesError } = await supabase
          .from('notes')
          .select(`
            *,
            users (name)
          `)
          .eq('circle_leader_id', leaderId)
          .order('created_at', { ascending: false });

        if (notesData && !notesError) {
          setNotes(notesData);
        } else {
          // Fallback to mock notes
          setNotes([
            {
              id: 1,
              circle_leader_id: leaderId,
              content: 'Great meeting last week. Good participation from the group.',
              created_at: '2024-01-15T10:30:00Z',
              created_by: 'Admin'
            },
            {
              id: 2,
              circle_leader_id: leaderId,
              content: 'Need to follow up on attendance next week.',
              created_at: '2024-01-20T14:15:00Z',
              created_by: 'Jane Doe'
            }
          ]);
        }
      } catch (error) {
        console.error('Error loading leader data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadLeaderData();
  }, [leaderId]);

  // Handle anchor link scrolling
  useEffect(() => {
    const hash = window.location.hash;
    if (hash === '#notes') {
      setTimeout(() => {
        const notesElement = document.getElementById('notes');
        if (notesElement) {
          notesElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Also focus on the textarea for better UX
          const textarea = document.getElementById('newNote');
          if (textarea) {
            textarea.focus();
          }
        }
      }, 100); // Small delay to ensure the element is rendered
    } else if (!hash) {
      // If no hash is present, ensure we're at the top of the page
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    }
  }, []);

  // Function to reload notes data
  const reloadNotes = async () => {
    try {
      const { data: notesData, error: notesError } = await supabase
        .from('notes')
        .select(`
          *,
          users (name)
        `)
        .eq('circle_leader_id', leaderId)
        .order('created_at', { ascending: false });

      if (notesData && !notesError) {
        setNotes(notesData);
      }
    } catch (error) {
      console.error('Error reloading notes:', error);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    setIsSavingNote(true);
    setNoteError('');
    
    try {
      // Simple note insertion
      const insertData = {
        circle_leader_id: leaderId,
        content: newNote.trim()
      };
      
      const { data, error } = await supabase
        .from('notes')
        .insert(insertData)
        .select('*')
        .single();

      if (data && !error) {
        // Success - reload notes to include user information and clear form
        await reloadNotes();
        setNewNote('');
      } else {
        console.error('Error saving note:', error);
        setNoteError(`Failed to save note: ${error?.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Exception saving note:', error);
      setNoteError('Failed to save note. Please try again.');
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleNoteKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAddNote();
    }
  };

  const handleTemplateSelect = (template: NoteTemplate) => {
    setNewNote(template.content);
    setIsTemplateModalOpen(false);
  };

  const openTemplateModal = () => {
    setIsTemplateModalOpen(true);
  };

  const handleEditNote = (note: Note) => {
    setEditingNoteId(note.id);
    setEditingNoteContent(note.content);
  };

  const handleSaveEditedNote = async () => {
    if (!editingNoteContent.trim() || !editingNoteId) return;

    setIsUpdatingNote(true);
    try {
      const { data, error } = await supabase
        .from('notes')
        .update({ content: editingNoteContent.trim() })
        .eq('id', editingNoteId)
        .select()
        .single();

      if (data && !error) {
        // Update local state
        setNotes(prev => prev.map(note => 
          note.id === editingNoteId 
            ? { ...note, content: editingNoteContent.trim() }
            : note
        ));
        setEditingNoteId(null);
        setEditingNoteContent('');
      } else {
        console.error('Error updating note:', error);
        setNoteError('Failed to update note in database. Please try again.');
        setTimeout(() => setNoteError(''), 5000);
      }
    } catch (error) {
      console.error('Error updating note:', error);
      setNoteError('Failed to update note. Please try again.');
      setTimeout(() => setNoteError(''), 5000);
    } finally {
      setIsUpdatingNote(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingNoteId(null);
    setEditingNoteContent('');
  };

  const handleDeleteNote = async (noteId: number) => {
    if (deletingNoteId !== noteId) {
      setDeletingNoteId(noteId);
      return;
    }

    setIsDeletingNote(true);
    try {
      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', noteId);

      if (!error) {
        // Remove from local state
        setNotes(prev => prev.filter(note => note.id !== noteId));
        setDeletingNoteId(null);
      } else {
        console.error('Error deleting note:', error);
        setNoteError('Failed to delete note from database. Please try again.');
        setTimeout(() => setNoteError(''), 5000);
      }
    } catch (error) {
      console.error('Error deleting note:', error);
      setNoteError('Failed to delete note. Please try again.');
      setTimeout(() => setNoteError(''), 5000);
    } finally {
      setIsDeletingNote(false);
    }
  };

  const handleSaveAsTemplate = async (note: Note) => {
    const templateName = window.prompt('Enter a name for this template:');
    if (!templateName || !templateName.trim()) return;

    setIsSavingAsTemplate(note.id);
    try {
      await saveTemplate(templateName.trim(), note.content);
      
      // Show success message
      setShowAlert({
        isOpen: true,
        type: 'success',
        title: 'Template Saved',
        message: `Note saved as template "${templateName.trim()}"`
      });
    } catch (error: any) {
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Save Failed',
        message: error.message || 'Failed to save note as template'
      });
    } finally {
      setIsSavingAsTemplate(null);
    }
  };

  const handleEditNoteKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSaveEditedNote();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  // Quick Action Handlers
  const handleSendEmail = () => {
    if (!leader?.email) {
      setShowAlert({
        isOpen: true,
        type: 'warning',
        title: 'No Email Address',
        message: 'No email address available for this leader.'
      });
      return;
    }
    
    const subject = `Circle Leader Communication - ${leader.name}`;
    const firstName = leader.name.split(' ')[0];
    const body = `Hi ${firstName}!`;
    const mailtoUrl = `mailto:${leader.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    window.open(mailtoUrl, '_blank');
  };

  const handleSendSMS = () => {
    if (!leader?.phone) {
      setShowAlert({
        isOpen: true,
        type: 'warning',
        title: 'No Phone Number',
        message: 'No phone number available for this leader.'
      });
      return;
    }
    
    // Clean phone number (remove formatting)
    const cleanPhone = leader.phone.replace(/\D/g, '');
    const firstName = leader.name.split(' ')[0];
    const message = `Hi ${firstName}!`;
    const smsUrl = `sms:${cleanPhone}?body=${encodeURIComponent(message)}`;
    
    window.open(smsUrl, '_blank');
  };

  const handleCallLeader = () => {
    if (!leader?.phone) {
      setShowAlert({
        isOpen: true,
        type: 'warning',
        title: 'No Phone Number',
        message: 'No phone number available for this leader.'
      });
      return;
    }
    
    // Clean phone number (remove formatting)
    const cleanPhone = leader.phone.replace(/\D/g, '');
    const telUrl = `tel:${cleanPhone}`;
    
    window.open(telUrl, '_self');
  };

  const handleContactClick = () => {
    if (!leader?.email && !leader?.phone) {
      setShowAlert({
        isOpen: true,
        type: 'warning',
        title: 'No Contact Information',
        message: 'No email or phone number available for this leader.'
      });
      return;
    }
    
    // If both email and phone exist, show options
    if (leader?.email && leader?.phone) {
      const choice = window.confirm('Choose contact method:\nOK = Email\nCancel = Phone');
      if (choice) {
        handleSendEmail();
      } else {
        handleCallLeader();
      }
    } else if (leader?.email) {
      handleSendEmail();
    } else if (leader?.phone) {
      handleCallLeader();
    }
  };

  const handleToggleEventSummary = async () => {
    if (!leader) return;

    setIsUpdatingEventSummary(true);
    const newStatus = !leader.event_summary_received;

    try {
      const { error } = await supabase
        .from('circle_leaders')
        .update({ event_summary_received: newStatus })
        .eq('id', leaderId);

      if (!error) {
        // Update local state
        setLeader(prev => prev ? { ...prev, event_summary_received: newStatus } : null);
        
        // Add a note about the status change
        const statusText = newStatus ? 'marked as received' : 'marked as not received';
        await supabase
          .from('notes')
          .insert([
            {
              circle_leader_id: leaderId,
              content: `Event summary status ${statusText}.`,
              created_by: 'System'
            }
          ]);

        // Refresh notes to show the new system note
        const { data: notesData } = await supabase
          .from('notes')
          .select(`
            *,
            users (name)
          `)
          .eq('circle_leader_id', leaderId)
          .order('created_at', { ascending: false });

        if (notesData) {
          setNotes(notesData);
        }
      } else {
        console.error('Error updating event summary status:', error);
        setShowAlert({
          isOpen: true,
          type: 'error',
          title: 'Update Failed',
          message: 'Failed to update event summary status. Please try again.'
        });
      }
    } catch (error) {
      console.error('Error updating event summary status:', error);
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Update Failed',
        message: 'Failed to update event summary status. Please try again.'
      });
    } finally {
      setIsUpdatingEventSummary(false);
    }
  };

  // Follow-up handlers
  const handleToggleFollowUp = async () => {
    if (!leader) return;

    setIsUpdatingFollowUp(true);
    const newStatus = !leader.follow_up_required;

    try {
      const updateData: any = { follow_up_required: newStatus };
      
      // If disabling follow-up, also clear the date
      if (!newStatus) {
        updateData.follow_up_date = null;
      }

      const { error } = await supabase
        .from('circle_leaders')
        .update(updateData)
        .eq('id', leaderId);

      if (!error) {
        // Update local state
        setLeader(prev => prev ? { 
          ...prev, 
          follow_up_required: newStatus,
          follow_up_date: newStatus ? prev.follow_up_date : undefined
        } : null);
        
        // Add a note about the status change
        const statusText = newStatus ? 'enabled' : 'disabled';
        await supabase
          .from('notes')
          .insert([
            {
              circle_leader_id: leaderId,
              content: `Follow-up status ${statusText}.`,
              created_by: 'System'
            }
          ]);

        // Refresh notes to show the new system note
        const { data: notesData } = await supabase
          .from('notes')
          .select(`
            *,
            users (name)
          `)
          .eq('circle_leader_id', leaderId)
          .order('created_at', { ascending: false });

        if (notesData) {
          setNotes(notesData);
        }
      } else {
        console.error('Error updating follow-up status:', error);
        setShowAlert({
          isOpen: true,
          type: 'error',
          title: 'Update Failed',
          message: 'Failed to update follow-up status. Please try again.'
        });
      }
    } catch (error) {
      console.error('Error updating follow-up status:', error);
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Update Failed',
        message: 'Failed to update follow-up status. Please try again.'
      });
    } finally {
      setIsUpdatingFollowUp(false);
    }
  };

  const handleFollowUpDateChange = async (newDate: string) => {
    if (!leader) return;

    try {
      const { error } = await supabase
        .from('circle_leaders')
        .update({ follow_up_date: newDate || null })
        .eq('id', leaderId);

      if (!error) {
        // Update local state
        setLeader(prev => prev ? { ...prev, follow_up_date: newDate || undefined } : null);
        
        // Add a note about the date change
        const dateText = newDate ? `set to ${newDate}` : 'cleared';
        await supabase
          .from('notes')
          .insert([
            {
              circle_leader_id: leaderId,
              content: `Follow-up date ${dateText}.`,
              created_by: 'System'
            }
          ]);

        // Refresh notes to show the new system note
        const { data: notesData } = await supabase
          .from('notes')
          .select(`
            *,
            users (name)
          `)
          .eq('circle_leader_id', leaderId)
          .order('created_at', { ascending: false });

        if (notesData) {
          setNotes(notesData);
        }
      } else {
        console.error('Error updating follow-up date:', error);
        setShowAlert({
          isOpen: true,
          type: 'error',
          title: 'Update Failed',
          message: 'Failed to update follow-up date. Please try again.'
        });
      }
    } catch (error) {
      console.error('Error updating follow-up date:', error);
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Update Failed',
        message: 'Failed to update follow-up date. Please try again.'
      });
    }
  };

  const handleEditLeader = () => {
    if (!leader) return;
    
    setIsEditing(true);
    const editData = {
      name: leader.name,
      email: leader.email,
      phone: leader.phone,
      campus: leader.campus,
      acpd: leader.acpd,
      status: leader.status,
      day: leader.day,
      time: leader.time,
      frequency: leader.frequency,
      circle_type: leader.circle_type,
      follow_up_required: leader.follow_up_required,
      follow_up_date: leader.follow_up_date,
      ccb_profile_link: leader.ccb_profile_link
    };
    
    setEditedLeader(editData);
  };

  const handleSaveLeader = async () => {
    if (!leader || !editedLeader) return;

    setIsSavingLeader(true);
    setLeaderError('');

    try {
      const { data, error } = await supabase
        .from('circle_leaders')
        .update({
          name: editedLeader.name,
          email: editedLeader.email || null,
          phone: editedLeader.phone || null,
          campus: editedLeader.campus || null,
          acpd: editedLeader.acpd || null,
          status: editedLeader.status || 'active',
          day: editedLeader.day || null,
          time: editedLeader.time || null,
          frequency: editedLeader.frequency || null,
          circle_type: editedLeader.circle_type || null,
          follow_up_required: editedLeader.follow_up_required || false,
          follow_up_date: editedLeader.follow_up_date || null,
          ccb_profile_link: editedLeader.ccb_profile_link || null
        })
        .eq('id', leaderId)
        .select()
        .single();

      if (data && !error) {
        setLeader(data);
        setIsEditing(false);
        setEditedLeader({});
        
        // Add a note about the update
        await supabase
          .from('notes')
          .insert([
            {
              circle_leader_id: leaderId,
              content: 'Circle Leader information updated.',
              created_by: 'System'
            }
          ]);

        // Refresh notes to show the new system note
        const { data: notesData } = await supabase
          .from('notes')
          .select(`
            *,
            users (name)
          `)
          .eq('circle_leader_id', leaderId)
          .order('created_at', { ascending: false });

        if (notesData) {
          setNotes(notesData);
        }
      } else {
        console.error('Error updating leader:', error);
        setLeaderError('Failed to update leader information. Please try again.');
        setTimeout(() => setLeaderError(''), 5000);
      }
    } catch (error) {
      console.error('Error updating leader:', error);
      setLeaderError('Failed to update leader information. Please try again.');
      setTimeout(() => setLeaderError(''), 5000);
    } finally {
      setIsSavingLeader(false);
    }
  };

  const handleCancelLeaderEdit = () => {
    setIsEditing(false);
    setEditedLeader({});
    setLeaderError('');
  };

  // Delete leader functionality
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingLeader, setIsDeletingLeader] = useState(false);

  const handleDeleteLeader = async () => {
    if (!leader) return;

    setIsDeletingLeader(true);
    try {
      // First delete all notes associated with the leader
      const { error: notesError } = await supabase
        .from('notes')
        .delete()
        .eq('circle_leader_id', leaderId);

      if (notesError) {
        throw new Error('Failed to delete associated notes');
      }

      // Then delete the leader
      const { error: leaderError } = await supabase
        .from('circle_leaders')
        .delete()
        .eq('id', leaderId);

      if (leaderError) {
        throw new Error('Failed to delete circle leader');
      }

      // Success - redirect to dashboard
      setShowAlert({
        isOpen: true,
        type: 'success',
        title: 'Circle Leader Deleted',
        message: 'The circle leader has been successfully deleted.'
      });

      // Redirect after a short delay
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 2000);

    } catch (error) {
      console.error('Error deleting leader:', error);
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Delete Failed',
        message: 'Failed to delete circle leader. Please try again.'
      });
    } finally {
      setIsDeletingLeader(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleLeaderFieldChange = (field: keyof CircleLeader, value: string | boolean) => {
    setEditedLeader(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTimeToAMPM = (timeString: string) => {
    if (!timeString) return 'Not scheduled';
    
    try {
      // Parse the time string (expecting HH:MM format)
      const [hours, minutes] = timeString.split(':').map(Number);
      
      // Create a date object for today with the given time
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);
      
      // Format to 12-hour time with AM/PM in Central Time
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Chicago' // Central Time
      });
    } catch (error) {
      console.error('Error formatting time:', error);
      return timeString; // Fallback to original time string
    }
  };

  if (isLoading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-8"></div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="space-y-4">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!leader) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Leader Not Found</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-4">The requested Circle Leader could not be found.</p>
            <a href="/dashboard" className="text-blue-600 dark:text-blue-400 hover:underline">
              Return to Dashboard
            </a>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <button
              onClick={() => window.history.back()}
              className="mr-4 p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-3xl font-bold text-blue-600 dark:text-blue-400">{leader.name}</h1>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Circle Leader Profile
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Profile Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Circle Information */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">Circle Information</h2>
                <button
                  onClick={isEditing ? handleCancelLeaderEdit : handleEditLeader}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  {isEditing ? 'Cancel' : 'Edit'}
                </button>
              </div>
              <div className="p-6">
                {leaderError && (
                  <div className="mb-4 flex items-center text-sm text-red-600 dark:text-red-400">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {leaderError}
                  </div>
                )}
                
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Column */}
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Name</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editedLeader.name || ''}
                          onChange={(e) => handleLeaderFieldChange('name', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Enter name"
                        />
                      ) : (
                        <span className="text-sm text-gray-900 dark:text-white">{leader.name || 'Not provided'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <select
                          value={editedLeader.status || 'active'}
                          onChange={(e) => handleLeaderFieldChange('status', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          {statuses.map((status) => (
                            <option key={status.id} value={status.value}>
                              {status.value.charAt(0).toUpperCase() + status.value.slice(1)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          leader.status === 'active' 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : leader.status === 'invited'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                            : leader.status === 'pipeline'
                            ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400'
                            : leader.status === 'paused'
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                            : leader.status === 'off-boarding'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                        }`}>
                          {leader.status === 'off-boarding' ? 'Off-boarding' 
                           : leader.status ? leader.status.charAt(0).toUpperCase() + leader.status.slice(1)
                           : 'Unknown'}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Phone</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          type="tel"
                          value={editedLeader.phone || ''}
                          onChange={(e) => handleLeaderFieldChange('phone', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Enter phone"
                        />
                      ) : (
                        <span className="text-sm text-gray-900 dark:text-white">{leader.phone || 'Not provided'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Circle Type</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <select
                          value={editedLeader.circle_type || ''}
                          onChange={(e) => handleLeaderFieldChange('circle_type', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Select Circle Type</option>
                          {circleTypes.map((type) => (
                            <option key={type.id} value={type.value}>
                              {type.value}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm text-gray-900 dark:text-white">{leader.circle_type || 'Not specified'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          type="email"
                          value={editedLeader.email || ''}
                          onChange={(e) => handleLeaderFieldChange('email', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Enter email"
                        />
                      ) : (
                        <span className="text-sm text-gray-900 dark:text-white">{leader.email || 'Not provided'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Meeting Day</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <select
                          value={editedLeader.day || ''}
                          onChange={(e) => handleLeaderFieldChange('day', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Select Day</option>
                          <option value="Monday">Monday</option>
                          <option value="Tuesday">Tuesday</option>
                          <option value="Wednesday">Wednesday</option>
                          <option value="Thursday">Thursday</option>
                          <option value="Friday">Friday</option>
                          <option value="Saturday">Saturday</option>
                          <option value="Sunday">Sunday</option>
                        </select>
                      ) : (
                        <span className="text-sm text-gray-900 dark:text-white">{leader.day || 'Not specified'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Campus</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <select
                          value={editedLeader.campus || ''}
                          onChange={(e) => handleLeaderFieldChange('campus', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Select Campus</option>
                          {campuses.map((campus) => (
                            <option key={campus.id} value={campus.value}>
                              {campus.value}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm text-gray-900 dark:text-white">{leader.campus || 'Not specified'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Meeting Time</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          type="time"
                          value={leader.time?.includes('AM') || leader.time?.includes('PM') 
                            ? convertAMPMTo24Hour(leader.time) 
                            : editedLeader.time || ''}
                          onChange={(e) => handleLeaderFieldChange('time', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      ) : (
                        <span className="text-sm text-gray-900 dark:text-white">{formatTimeToAMPM(leader.time || '') || 'Not specified'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Director</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <select
                          value={editedLeader.acpd || ''}
                          onChange={(e) => handleLeaderFieldChange('acpd', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Select Director</option>
                          {directors.map((director) => (
                            <option key={director.id} value={director.name}>
                              {director.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm text-gray-900 dark:text-white">{leader.acpd || 'Not assigned'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Meeting Frequency</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <select
                          value={editedLeader.frequency || ''}
                          onChange={(e) => handleLeaderFieldChange('frequency', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Select Frequency</option>
                          {frequencies.map((frequency) => (
                            <option key={frequency.id} value={frequency.value}>
                              {frequency.value}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm text-gray-900 dark:text-white">{leader.frequency || 'Not specified'}</span>
                      )}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">CCB Profile Link</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          type="url"
                          value={editedLeader.ccb_profile_link !== undefined ? editedLeader.ccb_profile_link : (leader.ccb_profile_link || '')}
                          onChange={(e) => handleLeaderFieldChange('ccb_profile_link', e.target.value)}
                          placeholder="https://example.ccbchurch.com/..."
                          className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      ) : (
                        <span className="text-sm text-gray-900 dark:text-white">
                          {leader.ccb_profile_link ? (
                            <a 
                              href={leader.ccb_profile_link} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 underline"
                            >
                              View CCB Profile
                            </a>
                          ) : (
                            'Not specified'
                          )}
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
                
                {isEditing && (
                  <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-3">
                    <div className="flex space-x-3">
                      <button
                        onClick={handleSaveLeader}
                        disabled={isSavingLeader || !editedLeader.name?.trim()}
                        className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isSavingLeader ? (
                          <div className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Saving...
                          </div>
                        ) : 'Save Changes'}
                      </button>
                      <button
                        onClick={handleCancelLeaderEdit}
                        disabled={isSavingLeader}
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="sm:ml-auto">
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={isSavingLeader}
                        className="px-4 py-2 border border-red-300 dark:border-red-600 rounded-md shadow-sm text-sm font-medium text-red-700 dark:text-red-400 bg-white dark:bg-gray-700 hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 transition-colors"
                      >
                        <svg className="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1H8a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete Circle Leader
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Event Summary */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <button
                onClick={handleToggleEventSummary}
                disabled={isUpdatingEventSummary}
                className="flex items-center justify-between w-full text-left hover:bg-gray-50 dark:hover:bg-gray-700 rounded p-2 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center">
                  <svg className={`w-4 h-4 mr-2 ${leader.event_summary_received ? 'text-green-600' : 'text-red-600'}`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d={leader.event_summary_received ? 
                      "M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" :
                      "M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    } clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-900 dark:text-white">
                    {isUpdatingEventSummary ? 'Updating...' : 'Event Summary'}
                  </span>
                </div>
                <span className={`text-xs ${leader.event_summary_received ? 'text-green-600' : 'text-red-600'}`}>
                  {leader.event_summary_received ? 'Complete' : 'Pending'}
                </span>
              </button>
            </div>

            {/* Follow Up */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
              {/* Follow Up Toggle */}
              <button
                onClick={handleToggleFollowUp}
                disabled={isUpdatingFollowUp}
                className="flex items-center justify-between w-full text-left hover:bg-gray-50 dark:hover:bg-gray-700 rounded p-2 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center">
                  <svg className={`w-4 h-4 mr-2 ${leader.follow_up_required ? 'text-orange-600' : 'text-gray-600'}`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d={leader.follow_up_required ? 
                      "M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" :
                      "M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    } clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-900 dark:text-white">
                    {isUpdatingFollowUp ? 'Updating...' : 'Follow-Up'}
                  </span>
                </div>
                <span className={`text-xs ${leader.follow_up_required ? 'text-orange-600' : 'text-gray-600'}`}>
                  {leader.follow_up_required ? 'Required' : 'None'}
                </span>
              </button>

              {/* Follow Up Date - Only show when follow-up is required */}
              {leader.follow_up_required && (
                <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
                  <input
                    type="date"
                    value={leader.follow_up_date || ''}
                    onChange={(e) => handleFollowUpDateChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {leader.follow_up_date && (
                    <div className={`mt-1 text-xs ${
                      getFollowUpStatus(leader.follow_up_date).isOverdue 
                        ? 'text-red-600' 
                        : getFollowUpStatus(leader.follow_up_date).isApproaching
                        ? 'text-yellow-600'
                        : 'text-green-600'
                    }`}>
                      {getFollowUpStatus(leader.follow_up_date).isOverdue && 'Overdue'}
                      {getFollowUpStatus(leader.follow_up_date).isApproaching && !getFollowUpStatus(leader.follow_up_date).isOverdue && 'Due Soon'}
                      {!getFollowUpStatus(leader.follow_up_date).isOverdue && !getFollowUpStatus(leader.follow_up_date).isApproaching && 'Scheduled'}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-2">
              <button 
                onClick={handleSendEmail}
                disabled={!leader?.email}
                className="w-full flex items-center justify-between px-3 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Send Email
                  </div>
                  {!leader?.email && <span className="text-xs opacity-60">No email</span>}
                </button>
                
                <button 
                  onClick={handleSendSMS}
                  disabled={!leader?.phone}
                  className="w-full flex items-center justify-between px-3 py-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    Send SMS
                  </div>
                  {!leader?.phone && <span className="text-xs opacity-60">No phone</span>}
                </button>
                
                <button 
                  onClick={handleCallLeader}
                  disabled={!leader?.phone}
                  className="w-full flex items-center justify-between px-3 py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    Call
                  </div>
                  {!leader?.phone && <span className="text-xs opacity-60">No phone</span>}
                </button>
                
                {/* CCB Profile Link */}
                {leader?.ccb_profile_link && (
                  <a 
                    href={leader.ccb_profile_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded text-sm"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    CCB Profile
                  </a>
                )}
                
                <button 
                  onClick={() => setShowLogConnectionModal(true)}
                  className="w-full flex items-center px-3 py-2 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded text-sm"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Log Connection
                </button>
              </div>
            </div>
          </div>

            {/* Notes Section */}
            <div id="notes" className="bg-white dark:bg-gray-800 rounded-lg shadow mt-8">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">Notes</h2>
              </div>
          <div className="p-4 sm:p-6">
            {/* Add Note */}
            <div className="mb-6 sm:mb-8">
              <div className="flex justify-between items-center mb-3">
                <label htmlFor="newNote" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Add a note
                </label>
                <button
                  type="button"
                  onClick={openTemplateModal}
                  className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                >
                  Use Template
                </button>
              </div>
              <div className="space-y-4">
                <textarea
                  id="newNote"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={handleNoteKeyDown}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y min-h-[100px] text-base"
                  placeholder="Enter your note here... (Cmd/Ctrl + Enter to save)"
                />
                
                {noteError && (
                  <div className="flex items-start text-sm text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-900/20 rounded-md">
                    <svg className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>{noteError}</span>
                  </div>
                )}
                
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                  <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                    {newNote.trim().length > 0 && (
                      <div>{newNote.trim().length} characters</div>
                    )}
                    <div className="text-xs">
                      💡 Tip: Type markdown-style links like [Display Text](URL) to create clickable links
                    </div>
                  </div>
                  <button
                    onClick={handleAddNote}
                    disabled={!newNote.trim() || isSavingNote}
                    className="w-full sm:w-auto px-6 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSavingNote ? (
                      <div className="flex items-center justify-center">
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Adding...
                      </div>
                    ) : 'Add Note'}
                  </button>
                </div>
              </div>
            </div>

            {/* Notes List */}
            <div className="space-y-4 sm:space-y-6">
              {notes.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="mt-4 text-base text-gray-500 dark:text-gray-400">No notes yet.</p>
                  <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">Add your first note above to get started.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {notes.length} {notes.length === 1 ? 'note' : 'notes'}
                    </p>
                  </div>
                  {notes.map((note, index) => (
                    <div key={note.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 sm:p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          {editingNoteId === note.id ? (
                            <div className="space-y-4">
                              <textarea
                                value={editingNoteContent}
                                onChange={(e) => setEditingNoteContent(e.target.value)}
                                onKeyDown={handleEditNoteKeyDown}
                                rows={4}
                                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y min-h-[80px] text-base"
                                placeholder="Edit your note... (Cmd/Ctrl + Enter to save, Esc to cancel)"
                              />
                              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                <div className="flex items-center space-x-3">
                                  <button
                                    onClick={handleSaveEditedNote}
                                    disabled={!editingNoteContent.trim() || isUpdatingNote}
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                  >
                                    {isUpdatingNote ? 'Saving...' : 'Save'}
                                  </button>
                                  <button
                                    onClick={handleCancelEdit}
                                    disabled={isUpdatingNote}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                  {editingNoteContent.trim().length} characters
                                </div>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="text-gray-900 dark:text-white whitespace-pre-wrap text-base leading-relaxed mb-4">
                                {linkifyText(note.content)}
                              </div>
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm text-gray-500 dark:text-gray-400">
                                <div className="flex items-center">
                                  <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                  </svg>
                                  <span className="truncate">{note.users?.name || note.created_by || 'Anonymous'}</span>
                                </div>
                                <div className="flex items-center">
                                  <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                                  </svg>
                                  <span>{formatDateTime(note.created_at)}</span>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                        
                        <div className="flex items-center justify-between sm:justify-end sm:flex-col sm:items-end gap-3">
                          {/* Note number badge */}
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                            #{notes.length - index}
                          </span>
                          
                          {/* Action buttons */}
                          {editingNoteId !== note.id && (
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleEditNote(note)}
                                disabled={editingNoteId !== null || isDeletingNote}
                                className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
                                title="Edit note"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>

                              <button
                                onClick={() => handleSaveAsTemplate(note)}
                                disabled={editingNoteId !== null || isDeletingNote || isSavingAsTemplate === note.id}
                                className="p-2 text-gray-400 hover:text-green-600 dark:hover:text-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
                                title="Save as template"
                              >
                                {isSavingAsTemplate === note.id ? (
                                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                )}
                              </button>
                              
                              {deletingNoteId === note.id ? (
                                <div className="flex items-center space-x-1">
                                  <button
                                    onClick={() => handleDeleteNote(note.id)}
                                    disabled={isDeletingNote}
                                    className="p-2 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-red-100 dark:hover:bg-red-900/20"
                                    title="Confirm delete"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => setDeletingNoteId(null)}
                                    disabled={isDeletingNote}
                                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
                                    title="Cancel delete"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleDeleteNote(note.id)}
                                  disabled={editingNoteId !== null || isDeletingNote}
                                  className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
                                  title="Delete note"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
          </div>
        </div>
        </div>
      
      {/* Alert Modal */}
      <AlertModal
        isOpen={showAlert.isOpen}
        onClose={() => setShowAlert({ ...showAlert, isOpen: false })}
        type={showAlert.type}
        title={showAlert.title}
        message={showAlert.message}
      />

      {/* Log Connection Modal */}
      <LogConnectionModal
        isOpen={showLogConnectionModal}
        onClose={() => setShowLogConnectionModal(false)}
        circleLeaderId={leader?.id || 0}
        circleLeaderName={leader?.name || ''}
        onConnectionLogged={async () => {
          // Reload notes to show the new connection log
          await reloadNotes();
          
          // Show success message
          setShowAlert({
            isOpen: true,
            type: 'success',
            title: 'Connection Logged',
            message: 'Connection has been successfully logged.'
          });
        }}
      />

      {/* Delete Circle Leader Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteLeader}
        title="Delete Circle Leader"
        message={`Are you sure you want to delete ${leader?.name || 'this circle leader'}? This action cannot be undone and will also delete all associated notes.`}
        confirmText={isDeletingLeader ? 'Deleting...' : 'Delete'}
        cancelText="Cancel"
        type="danger"
        isLoading={isDeletingLeader}
      />

      {/* Note Template Modal */}
      <NoteTemplateModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        onTemplateSelect={handleTemplateSelect}
        mode="select"
      />
    </ProtectedRoute>
  );
}
