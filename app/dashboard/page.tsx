'use client';

import { useState, useEffect, useMemo } from 'react';
import FilterPanel from '../../components/dashboard/FilterPanel-new';
import CircleLeaderCard from '../../components/dashboard/CircleLeaderCard';
import CircleStatusBar from '../../components/dashboard/CircleStatusBar';
import TodayCircles from '../../components/dashboard/TodayCircles';
import FollowUpTable from '../../components/dashboard/FollowUpTable';
import ContactModal from '../../components/dashboard/ContactModal';
import EventSummaryProgress from '../../components/dashboard/EventSummaryProgress';
import ConnectionsProgress from '../../components/dashboard/ConnectionsProgress';
import LogConnectionModal from '../../components/dashboard/LogConnectionModal';
import AddNoteModal from '../../components/dashboard/AddNoteModal';
import ConfirmModal from '../../components/ui/ConfirmModal';
import AlertModal from '../../components/ui/AlertModal';
import ProtectedRoute from '../../components/ProtectedRoute';
import ExportModal from '../../components/dashboard/ExportModal';
import CircleVisitsDashboard from '../../components/dashboard/CircleVisitsDashboard';
import { useDashboardFilters } from '../../hooks/useDashboardFilters';
import { useCircleLeaders, CircleLeaderFilters } from '../../hooks/useCircleLeaders';
import { useTodayCircles } from '../../hooks/useTodayCircles';
import { CircleLeader, supabase, Note, UserNote } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import Link from 'next/link';

interface ContactModalData {
  isOpen: boolean;
  leaderId: number;
  name: string;
  email: string;
  phone: string;
}

interface LogConnectionModalData {
  isOpen: boolean;
  leaderId: number;
  name: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { filters, updateFilters, clearAllFilters, isInitialized, isFirstVisit } = useDashboardFilters();
  const { 
    circleLeaders, 
    isLoading, 
    error, 
    loadCircleLeaders,
    toggleEventSummary, 
    resetEventSummaryCheckboxes,
    toggleFollowUp,
    updateStatus,
    bulkUpdateStatus,
    invalidateCache,
    getCacheDebugInfo
  } = useCircleLeaders();

  // Load today's circles separately for better performance
  const { 
    todayCircles, 
    isLoading: todayCirclesLoading, 
    refreshTodayCircles 
  } = useTodayCircles({
    campus: filters.campus,
    acpd: filters.acpd,
    status: filters.status,
    circleType: filters.circleType,
    eventSummary: filters.eventSummary,
    timeOfDay: filters.timeOfDay
  }, isInitialized && !isFirstVisit && filters.campus.length > 0); // Only load if not first visit and campus selected

    // State for tracking connected leaders this month
  const [connectedThisMonth, setConnectedThisMonth] = useState<number[]>([]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  
  // Connections tracking state
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectedLeaderIds, setConnectedLeaderIds] = useState<Set<number>>(new Set());
  
  // Refresh key for FilterPanel follow-up table
  const [filterPanelRefreshKey, setFilterPanelRefreshKey] = useState(0);
  
  // Active section tracking for sticky navigation
  const [activeSection, setActiveSection] = useState('personal-notes');
  
  // State for modals
  type RecentNote = Pick<Note, 'id' | 'circle_leader_id' | 'content' | 'created_at'>;
  const [recentNotes, setRecentNotes] = useState<RecentNote[]>([]);
  const [recentNotesLoading, setRecentNotesLoading] = useState(false);
  const [recentNotesVisible, setRecentNotesVisible] = useState(() => {
    try {
      const saved = localStorage.getItem('recentNotesVisible');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  // Personal dashboard notes state
  const [userNotes, setUserNotes] = useState<UserNote[]>([]);
  const [userNotesLoading, setUserNotesLoading] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [savingNoteId, setSavingNoteId] = useState<number | null>(null);
  const [userNotesVisible, setUserNotesVisible] = useState(() => {
    try {
      const saved = localStorage.getItem('userNotesVisible');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [deleteNoteModal, setDeleteNoteModal] = useState<{
    isOpen: boolean;
    noteId: number | null;
    content: string;
  }>({
    isOpen: false,
    noteId: null,
    content: ''
  });

  // Load recent notes (latest 10) filtered by current dashboard filters
  const loadRecentNotes = async () => {
    setRecentNotesLoading(true);
    try {
      // Get the filtered leader IDs to filter notes by
      const filteredLeaderIds = filteredLeaders.map(leader => leader.id);
      
      // If no filtered leaders, don't show any notes
      if (filteredLeaderIds.length === 0) {
        setRecentNotes([]);
        return;
      }
      
      const { data, error } = await supabase
        .from('notes')
        .select('id, circle_leader_id, content, created_at')
        .in('circle_leader_id', filteredLeaderIds)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) {
        console.error('Error loading recent notes:', error);
        setRecentNotes([]);
        return;
      }
      setRecentNotes((data as any) || []);
    } catch (e) {
      console.error('Error loading recent notes:', e);
      setRecentNotes([]);
    } finally {
      setRecentNotesLoading(false);
    }
  };

  // Load user's personal dashboard notes
  const loadUserNotes = async () => {
    if (!user?.id) return;
    
    setUserNotesLoading(true);
    try {
      // First try to query with pinned column (for when migration is complete)
      let { data, error } = await supabase
        .from('user_notes')
        .select('*')
        .eq('user_id', user.id)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false });
      
      // If column doesn't exist, fall back to original query
      if (error && error.code === '42703') {
        console.log('Pinned column not found, using fallback query');
        const fallbackQuery = await supabase
          .from('user_notes')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        
        data = fallbackQuery.data;
        error = fallbackQuery.error;
        
        // Add pinned: false to all notes for UI compatibility
        if (data) {
          data = data.map(note => ({ ...note, pinned: false }));
        }
      }
      
      if (error) {
        console.error('Error loading user notes:', error);
        return;
      }
      
      // Sort notes to ensure pinned notes are always at the top
      const sortedNotes = (data || []).sort((a, b) => {
        // First sort by pinned status (pinned notes first)
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        
        // Then sort by creation date (newest first)
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      
      setUserNotes(sortedNotes);
    } catch (e) {
      console.error('Error loading user notes:', e);
    } finally {
      setUserNotesLoading(false);
    }
  };

  // Save a new user note
  const saveNewUserNote = async () => {
    if (!user?.id || !newNoteContent.trim()) return;
    
    setSavingNoteId(-1); // Use -1 for new note
    try {
      const { data, error } = await supabase
        .from('user_notes')
        .insert({ user_id: user.id, content: newNoteContent })
        .select()
        .single();
      
      if (error) {
        console.error('Error creating user note:', error);
        return;
      }
      
      // Add pinned: false for UI compatibility and sort the list
      const newNote = { ...data, pinned: false };
      setUserNotes(prev => {
        const updatedNotes = [newNote, ...prev];
        
        // Sort to ensure pinned notes stay at the top
        return updatedNotes.sort((a, b) => {
          // First sort by pinned status (pinned notes first)
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          
          // Then sort by creation date (newest first)
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      });
      setNewNoteContent('');
    } catch (e) {
      console.error('Error saving user note:', e);
    } finally {
      setSavingNoteId(null);
    }
  };

  // Update an existing note
  const updateUserNote = async (noteId: number, content: string) => {
    setSavingNoteId(noteId);
    try {
      const { error } = await supabase
        .from('user_notes')
        .update({ content })
        .eq('id', noteId);
      
      if (error) {
        console.error('Error updating user note:', error);
        return;
      }
      
      setUserNotes(prev => prev.map(note => 
        note.id === noteId ? { ...note, content } : note
      ));
      setEditingNoteId(null);
      setEditingContent('');
    } catch (e) {
      console.error('Error updating user note:', e);
    } finally {
      setSavingNoteId(null);
    }
  };

  // Toggle pin status of a note
  const togglePinNote = async (noteId: number) => {
    try {
      const note = userNotes.find(n => n.id === noteId);
      if (!note) return;

      const { error } = await supabase
        .from('user_notes')
        .update({ pinned: !note.pinned })
        .eq('id', noteId);
      
      if (error) {
        if (error.code === '42703') {
          // Column doesn't exist yet, show a helpful message
          setShowAlert({
            isOpen: true,
            type: 'info',
            title: 'Feature Not Available',
            message: 'The pin feature requires a database update. Please run the migration SQL first.'
          });
          return;
        }
        console.error('Error toggling pin status:', error);
        return;
      }
      
      // Update the note and re-sort the list
      setUserNotes(prev => {
        const updatedNotes = prev.map(n => 
          n.id === noteId ? { ...n, pinned: !n.pinned } : n
        );
        
        // Sort to ensure pinned notes stay at the top
        return updatedNotes.sort((a, b) => {
          // First sort by pinned status (pinned notes first)
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          
          // Then sort by creation date (newest first)
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      });
    } catch (e) {
      console.error('Error toggling pin status:', e);
    }
  };

  // Delete a user note
  const deleteUserNote = async (noteId: number) => {
    try {
      const { error } = await supabase
        .from('user_notes')
        .delete()
        .eq('id', noteId);
      
      if (error) {
        console.error('Error deleting user note:', error);
        return;
      }
      
      setUserNotes(prev => prev.filter(note => note.id !== noteId));
    } catch (e) {
      console.error('Error deleting user note:', e);
    }
  };

  // Open delete confirmation modal
  const openDeleteNoteModal = (noteId: number, content: string) => {
    setDeleteNoteModal({
      isOpen: true,
      noteId,
      content
    });
  };

  // Close delete confirmation modal
  const closeDeleteNoteModal = () => {
    setDeleteNoteModal({
      isOpen: false,
      noteId: null,
      content: ''
    });
  };

  // Copy note content to clipboard
  const copyNoteToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      // Close the delete modal if it's open
      closeDeleteNoteModal();
      setShowAlert({
        isOpen: true,
        type: 'success',
        title: 'Copied',
        message: 'Note content copied to clipboard successfully.'
      });
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Copy Failed',
        message: 'Failed to copy note to clipboard. Please try again.'
      });
    }
  };

  // Confirm delete note
  const confirmDeleteNote = async () => {
    if (deleteNoteModal.noteId) {
      await deleteUserNote(deleteNoteModal.noteId);
      closeDeleteNoteModal();
      setShowAlert({
        isOpen: true,
        type: 'success',
        title: 'Note Deleted',
        message: 'The note has been deleted successfully.'
      });
    }
  };

  // Start editing a note
  const startEditingNote = (noteId: number, content: string) => {
    setEditingNoteId(noteId);
    setEditingContent(content);
    
    // Auto-resize textarea to fit content after a short delay
    setTimeout(() => {
      const textarea = document.querySelector(`textarea[data-editing-id="${noteId}"]`) as HTMLTextAreaElement;
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(80, Math.min(600, textarea.scrollHeight)) + 'px';
      }
    }, 10);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingNoteId(null);
    setEditingContent('');
  };

  // Reference data state
  const [directors, setDirectors] = useState<Array<{id: number; name: string}>>([]);
  const [campuses, setCampuses] = useState<Array<{id: number; value: string}>>([]);
  const [statuses, setStatuses] = useState<Array<{id: number; value: string}>>([]);
  const [circleTypes, setCircleTypes] = useState<Array<{id: number; value: string}>>([]);
  const [frequencies, setFrequencies] = useState<Array<{id: number; value: string}>>([]);
  const [referenceDataLoading, setReferenceDataLoading] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // Load reference data
  const loadReferenceData = async () => {
    setReferenceDataLoading(true);
    try {
      const response = await fetch('/api/reference-data/');
      
      const data = await response.json();

      // Always set the data arrays, even if they're empty (graceful fallback)
      setDirectors(data.directors || []);
      setCampuses(data.campuses || []);
      setStatuses(data.statuses || []);
      setCircleTypes(data.circleTypes || []);
      setFrequencies(data.frequencies || []);

      if (!response.ok) {
        console.warn('Reference data API returned non-OK status, using fallback empty arrays');
      }
    } catch (error) {
      console.error('Error loading reference data:', error);
      // Set empty arrays as fallback
      setDirectors([]);
      setCampuses([]);
      setStatuses([]);
      setCircleTypes([]);
      setFrequencies([]);
    } finally {
      setReferenceDataLoading(false);
    }
  };

  // Load connected leaders for this month
  const loadConnectedLeaders = async () => {
    setConnectionsLoading(true);
    try {
      // Get current month boundaries
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      const startDate = firstDayOfMonth.toISOString().split('T')[0];
      const endDate = lastDayOfMonth.toISOString().split('T')[0];

      // Query for connections this month
      const { data: connections, error } = await supabase
        .from('connections')
        .select('circle_leader_id')
        .gte('date_of_connection', startDate)
        .lte('date_of_connection', endDate);

      if (error) {
        console.error('Error fetching connected leaders:', error);
        return;
      }

      // Create set of unique leader IDs who have connections this month
      const uniqueLeaderIds = new Set(connections?.map(conn => conn.circle_leader_id) || []);
      setConnectedLeaderIds(uniqueLeaderIds);
    } catch (error) {
      console.error('Error loading connected leaders:', error);
    } finally {
      setConnectionsLoading(false);
    }
  };

  // Load connected leaders when component mounts or circleLeaders change
  useEffect(() => {
    if (circleLeaders.length > 0) {
      loadConnectedLeaders();
    }
  }, [circleLeaders]);

  // Load reference data when component mounts
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;
    loadReferenceData();
  }, [isClient]);

  const clearFilters = () => {
    updateFilters({
      campus: [],
      acpd: [],
      status: [],
      meetingDay: [],
      circleType: [],
      eventSummary: 'all',
      connected: 'all',
      timeOfDay: 'all'
    });
  };

  const [contactModal, setContactModal] = useState<ContactModalData>({
    isOpen: false,
    leaderId: 0,
    name: '',
    email: '',
    phone: ''
  });

  const [logConnectionModal, setLogConnectionModal] = useState<LogConnectionModalData>({
    isOpen: false,
    leaderId: 0,
    name: ''
  });

  const [addNoteModal, setAddNoteModal] = useState<{
    isOpen: boolean;
    leaderId?: number;
    name?: string;
    clearFollowUp?: boolean;
  }>({
    isOpen: false,
    leaderId: undefined,
    name: undefined,
    clearFollowUp: false
  });

  const [exportModal, setExportModal] = useState(false);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
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



  // Filter circle leaders - now mostly client-side for complex logic
  const filteredLeaders = useMemo(() => {
    let filtered = [...circleLeaders];

    // Most filtering is now done server-side, but we still need client-side for:
    // 1. Follow-up status (complex logic)
    // 2. Connected status (requires connections data)
    // 3. Time of day (complex parsing logic)

    // Follow-up status filter (client-side only)
    if (filters.status.length > 0 && filters.status.includes('follow-up')) {
      // If only follow-up is selected, show only follow-up required
      if (filters.status.length === 1 && filters.status[0] === 'follow-up') {
        filtered = filtered.filter(leader => leader.follow_up_required);
      } else {
        // If follow-up is mixed with other statuses, include follow-up required leaders
        filtered = filtered.filter(leader => {
          const statusMatch = filters.status.some(status => 
            status !== 'follow-up' && status === leader.status
          );
          const followUpMatch = leader.follow_up_required;
          return statusMatch || followUpMatch;
        });
      }
    }

    // Connected filter (client-side - requires connections data)
    if (filters.connected === 'connected') {
      filtered = filtered.filter(leader => connectedLeaderIds.has(leader.id));
    } else if (filters.connected === 'not_connected') {
      filtered = filtered.filter(leader => !connectedLeaderIds.has(leader.id));
    }

    // Time of Day filter (client-side - complex parsing)
    if (filters.timeOfDay === 'am' || filters.timeOfDay === 'pm') {
      filtered = filtered.filter(leader => {
        if (!leader.time) return false;
        
        // First try to parse 12-hour format with AM/PM (e.g., "7:00 PM", "10:30 AM")
        const ampmMatch = leader.time.match(/(\d{1,2}):?(\d{0,2})\s*(AM|PM)/i);
        if (ampmMatch) {
          const period = ampmMatch[3].toUpperCase();
          return filters.timeOfDay === 'am' ? period === 'AM' : period === 'PM';
        }
        
        // Try to parse 24-hour format (e.g., "19:00", "18:30", "07:30")
        const time24Match = leader.time.match(/^(\d{1,2}):(\d{2})$/);
        if (time24Match) {
          const hour = parseInt(time24Match[1], 10);
          // 0-11 hours = AM, 12-23 hours = PM
          if (filters.timeOfDay === 'am') {
            return hour >= 0 && hour < 12;
          } else {
            return hour >= 12 && hour <= 23;
          }
        }
        
        return false;
      });
    }

    // Sort by name (always client-side)
    filtered.sort((a, b) => {
      const aName = a.name || '';
      const bName = b.name || '';
      return aName.localeCompare(bName);
    });

    return filtered;
  }, [circleLeaders, filters, connectedLeaderIds]);

  // Memoize filtered leader IDs to prevent unnecessary ConnectionsProgress re-renders
  const filteredLeaderIds = useMemo(() => {
    return filteredLeaders.map(leader => leader.id);
  }, [filteredLeaders]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredLeaders.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedLeaders = useMemo(() => {
    if (itemsPerPage === -1) return filteredLeaders; // Show all
    return filteredLeaders.slice(startIndex, endIndex);
  }, [filteredLeaders, startIndex, endIndex, itemsPerPage]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Calculate event summary progress
  const eventSummaryProgress = useMemo(() => {
    const total = filteredLeaders.length;
    const received = filteredLeaders.filter(leader => leader.event_summary_received === true).length;
    const percentage = total > 0 ? Math.round((received / total) * 100) : 0;
    
    return {
      total,
      received,
      percentage
    };
  }, [filteredLeaders]);

  // Calculate status distribution for the status bar - filtered by campus only
  const statusData = useMemo(() => {
    const statusCounts = {
      'Invited': 0,
      'Pipeline': 0,
      'Active': 0,
      'Follow-Up': 0,
      'Paused': 0,
      'Off-Boarding': 0
    };

    // Filter leaders by campus only for status overview
    let leadersForStatusOverview = [...circleLeaders];
    if (filters.campus.length > 0) {
      leadersForStatusOverview = leadersForStatusOverview.filter(leader => 
        filters.campus.includes(leader.campus || '')
      );
    }

    // Count statuses from campus-filtered leaders
    leadersForStatusOverview.forEach(leader => {
      const status = leader.status;
      
      if (status === 'invited') statusCounts['Invited']++;
      else if (status === 'pipeline') statusCounts['Pipeline']++;
      else if (status === 'active') statusCounts['Active']++;
      else if (status === 'paused') statusCounts['Paused']++;
      else if (status === 'off-boarding') statusCounts['Off-Boarding']++;
      
      // Add to Follow-Up if follow_up_required is true
      if (leader.follow_up_required) {
        statusCounts['Follow-Up']++;
      }
    });

    // Convert to the format expected by CircleStatusBar
    return [
      { status: 'Invited' as const, count: statusCounts['Invited'], color: 'bg-blue-500' },
      { status: 'Pipeline' as const, count: statusCounts['Pipeline'], color: 'bg-indigo-500' },
      { status: 'Active' as const, count: statusCounts['Active'], color: 'bg-green-500' },
      { status: 'Follow-Up' as const, count: statusCounts['Follow-Up'], color: 'bg-orange-500' },
      { status: 'Paused' as const, count: statusCounts['Paused'], color: 'bg-yellow-500' },
      { status: 'Off-Boarding' as const, count: statusCounts['Off-Boarding'], color: 'bg-red-500' }
    ];
  }, [circleLeaders, filters.campus]);

  // Toggle Recent Notes visibility and persist to localStorage
  const toggleRecentNotesVisibility = () => {
    setRecentNotesVisible(prev => {
      const newVisible = !prev;
      try {
        localStorage.setItem('recentNotesVisible', newVisible.toString());
      } catch (error) {
        console.error('Failed to save recent notes visibility to localStorage:', error);
      }
      return newVisible;
    });
  };

  // Toggle User Notes visibility and persist to localStorage
  const toggleUserNotesVisibility = () => {
    setUserNotesVisible(prev => {
      const newVisible = !prev;
      try {
        localStorage.setItem('userNotesVisible', newVisible.toString());
      } catch (error) {
        console.error('Failed to save user notes visibility to localStorage:', error);
      }
      return newVisible;
    });
  };

  // Function to convert URLs in text to clickable links
  const linkifyText = (text: string) => {
    if (!text) return text;
    
    // First, handle markdown-style links [text](url)
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    
    // Split by markdown links first
    const parts = text.split(markdownLinkRegex);
    const elements: React.ReactNode[] = [];
    
    for (let i = 0; i < parts.length; i += 3) {
      const beforeText = parts[i];
      const linkText = parts[i + 1];
      const linkUrl = parts[i + 2];
      
      // Process the text before the link for regular URLs
      if (beforeText) {
        const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
        const urlParts = beforeText.split(urlRegex);
        
        urlParts.forEach((part, index) => {
          if (/^https?:\/\//.test(part)) {
            elements.push(
              <a
                key={`url-${i}-${index}`}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline break-all"
              >
                {part}
              </a>
            );
          } else if (part) {
            // Handle line breaks in regular text
            const lines = part.split('\n');
            lines.forEach((line, lineIndex) => {
              elements.push(<span key={`text-${i}-${index}-${lineIndex}`}>{line}</span>);
              if (lineIndex < lines.length - 1) {
                elements.push(<br key={`br-${i}-${index}-${lineIndex}`} />);
              }
            });
          }
        });
      }
      
      // Add the markdown link if it exists
      if (linkText && linkUrl) {
        elements.push(
          <a
            key={`markdown-${i}`}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            {linkText}
          </a>
        );
      }
    }
    
    return elements.length > 0 ? elements : text;
  };

  // Helper function to convert dashboard filters to server-side filters
  const getServerFilters = (): CircleLeaderFilters => {
    const serverFilters: CircleLeaderFilters = {};
    
    // Campus filter
    if (filters.campus.length > 0) {
      serverFilters.campus = filters.campus;
    }
    
    // ACPD filter
    if (filters.acpd.length > 0) {
      serverFilters.acpd = filters.acpd;
    }
    
    // Status filter - with special archive handling
    if (filters.status.length > 0) {
      serverFilters.status = filters.status;
    } else {
      // If no status filter is explicitly selected, exclude archive by default
      // This ensures archived circles don't show up unless explicitly selected
      serverFilters.statusExclude = ['archive'];
    }
    
    // Meeting day filter
    if (filters.meetingDay.length > 0) {
      serverFilters.meetingDay = filters.meetingDay;
    }
    
    // Circle type filter
    if (filters.circleType.length > 0) {
      serverFilters.circleType = filters.circleType;
    }
    
    // Event summary filter (convert to string)
    if (filters.eventSummary !== 'all') {
      serverFilters.eventSummary = filters.eventSummary;
    }
    
    return serverFilters;
  };

  // Load data on component mount and when filters change
  useEffect(() => {
    if (isInitialized && !isFirstVisit) {
      // Only load data if not first visit or if user has selected at least one campus
      if (filters.campus.length > 0 || !isFirstVisit) {
        loadCircleLeaders(getServerFilters());
      }
    }
  }, [loadCircleLeaders, isInitialized, isFirstVisit,
      JSON.stringify(filters.campus),
      JSON.stringify(filters.acpd),
      JSON.stringify(filters.status), 
      JSON.stringify(filters.meetingDay),
      JSON.stringify(filters.circleType),
      filters.eventSummary,
      filters.connected,
      filters.timeOfDay
  ]);

  // Load recent notes when filtered leaders change
  useEffect(() => {
    // Small delay to ensure filteredLeaders has been calculated
    const timeoutId = setTimeout(() => {
      loadRecentNotes();
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [filteredLeaders]);

  // Load user's personal notes on component mount
  useEffect(() => {
    if (user?.id) {
      loadUserNotes();
    }
  }, [user?.id]);

  // Scroll spy effect to track active section
  useEffect(() => {
    const handleScroll = () => {
      const sections = ['personal-notes', 'filters', 'status-overview', 'follow-up', 'recent-notes', 'circle-leaders'];
      
      // Get current scroll position
      const scrollY = window.scrollY;
      
      // If we're at the very top of the page (within 200px), always highlight the first section
      if (scrollY <= 200) {
        setActiveSection('personal-notes');
        return;
      }
      
      // Find the section that's currently most visible in the viewport
      let activeSection = 'personal-notes'; // default
      let maxVisibility = 0;
      
      sections.forEach(sectionId => {
        const element = document.getElementById(sectionId);
        if (element) {
          const rect = element.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          
          // Calculate how much of the section is visible
          const visibleTop = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(0, rect.top));
          const sectionHeight = rect.height;
          const visibilityRatio = visibleTop / Math.max(1, sectionHeight);
          
          // Prefer sections that are near the top of the viewport (within 300px from top)
          const distanceFromTop = Math.abs(rect.top);
          const topBonus = distanceFromTop < 300 ? 1.5 : 1;
          
          const score = visibilityRatio * topBonus;
          
          if (score > maxVisibility) {
            maxVisibility = score;
            activeSection = sectionId;
          }
        }
      });
      
      setActiveSection(activeSection);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Check initial state
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Custom scroll function to handle offset and show hidden sections
  const scrollToSection = (sectionId: string) => {
    // Auto-show hidden sections when navigating to them
    if (sectionId === 'recent-notes' && !recentNotesVisible) {
      setRecentNotesVisible(true);
      try {
        localStorage.setItem('recentNotesVisible', 'true');
      } catch (error) {
        // Ignore localStorage errors
      }
    }
    
    if (sectionId === 'personal-notes' && !userNotesVisible) {
      setUserNotesVisible(true);
      try {
        localStorage.setItem('userNotesVisible', 'true');
      } catch (error) {
        // Ignore localStorage errors
      }
    }
    
    // Small delay to allow section to expand before scrolling
    setTimeout(() => {
      const element = document.getElementById(sectionId);
      if (element) {
        const yOffset = -125; // Offset for sticky headers (nav + active filters)
        const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }, sectionId === 'recent-notes' || sectionId === 'personal-notes' ? 100 : 0);
  };

  // Event handlers
  const handleToggleEventSummary = async (leaderId: number, isChecked: boolean) => {
    try {
      await toggleEventSummary(leaderId, isChecked);
      // Refresh the data
      loadCircleLeaders(getServerFilters());
    } catch (error) {
      console.error('Error toggling event summary:', error);
    }
  };  const handleResetCheckboxes = async () => {
    setShowResetConfirm(true);
  };

  const confirmResetCheckboxes = async () => {
    const leaderIds = filteredLeaders.map(leader => leader.id);
    await resetEventSummaryCheckboxes(leaderIds);
    setShowResetConfirm(false);
  };

  const handleBulkUpdateStatus = async (status: string) => {
    try {
      const leaderIds = filteredLeaders.map(leader => leader.id);
      await bulkUpdateStatus(leaderIds, status);
      // Refresh the data
      loadCircleLeaders(getServerFilters());
    } catch (error) {
      console.error('Error bulk updating status:', error);
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Update Failed',
        message: 'Failed to update status. Please try again.'
      });
    }
  };

  const handleUpdateStatus = async (leaderId: number, newStatus: string, followUpDate?: string) => {
    try {
      await updateStatus(leaderId, newStatus, followUpDate);
      loadCircleLeaders(getServerFilters());
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleStatusBarClick = (status: string) => {
    // Map display status to filter values
    const statusMap: Record<string, string[]> = {
      'Invited': ['invited'],
      'Pipeline': ['pipeline'],
      'Active': ['active'],
      'Follow-Up': ['follow-up'],
      'Paused': ['paused'],
      'Off-Boarding': ['off-boarding']
    };

    const filterValues = statusMap[status] || [];
    
    updateFilters({
      ...filters,
      status: filterValues
    });
  };

  const openContactModal = (leaderId: number, name: string, email: string, phone: string) => {
    setContactModal({
      isOpen: true,
      leaderId,
      name,
      email,
      phone
    });
  };

  const closeContactModal = () => {
    setContactModal({
      isOpen: false,
      leaderId: 0,
      name: '',
      email: '',
      phone: ''
    });
  };

  const openLogConnectionModal = (leaderId: number, name: string) => {
    setLogConnectionModal({
      isOpen: true,
      leaderId,
      name
    });
  };

  const closeLogConnectionModal = () => {
    setLogConnectionModal({
      isOpen: false,
      leaderId: 0,
      name: ''
    });
  };

  // Add Note Modal Functions
  const openAddNoteModal = (leaderId?: number, name?: string, clearFollowUp?: boolean) => {
    setAddNoteModal({
      isOpen: true,
      leaderId,
      name,
      clearFollowUp: clearFollowUp || false
    });
  };

  const closeAddNoteModal = () => {
    setAddNoteModal({
      isOpen: false,
      leaderId: undefined,
      name: undefined,
      clearFollowUp: false
    });
  };

  const handleNoteAdded = () => {
    // Clear cache since notes affect last_note data
    invalidateCache();
    loadCircleLeaders(getServerFilters()); // Refresh the data to show the new note
    loadRecentNotes();   // Refresh recent notes table
    refreshTodayCircles(); // Refresh today's circles since notes affect them too
    // If a follow-up was cleared, refresh the FilterPanel follow-up table
    if (addNoteModal.clearFollowUp) {
      setFilterPanelRefreshKey(prev => prev + 1);
    }
    const messageText = addNoteModal.clearFollowUp ? 'Follow-up cleared and note added successfully.' : 'The note has been successfully added.';
    setShowAlert({
      isOpen: true,
      type: 'success',
      title: addNoteModal.clearFollowUp ? 'Follow-Up Cleared' : 'Note Added',
      message: messageText
    });
  };

  // Clear Follow-Up Handler
  const handleClearFollowUp = (leaderId: number, name: string) => {
    openAddNoteModal(leaderId, name, true);
  };

  const handleConnectionLogged = () => {
    // Clear cache since connections create notes which affect last_note data
    invalidateCache();
    // Refresh the data to update connections progress
    loadCircleLeaders(getServerFilters());
    // Also refresh recent notes (connections create notes)
    loadRecentNotes();
    // Refresh today's circles since connections create notes
    refreshTodayCircles();
  };

  // For now, assume user is admin - in a real app, you'd get this from your auth context
  const isAdmin = true;

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <div className="rounded-md bg-red-50 p-4">
            <h3 className="text-sm font-medium text-red-800">Error loading dashboard</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
            <div className="mt-4">
              <button
                onClick={() => loadCircleLeaders(getServerFilters())}
                className="bg-red-100 px-3 py-2 rounded-md text-sm font-medium text-red-800 hover:bg-red-200"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
              </div>
              <div className="mt-4 sm:mt-0">
                <button
                  onClick={() => setExportModal(true)}
                  className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export
                </button>
              </div>
            </div>
          </div>

          {/* Sticky Section Navigation */}
          <div className="sticky top-0 z-[1000] bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 -mx-3 sm:-mx-4 lg:-mx-8 px-3 sm:px-4 lg:px-8 shadow-sm">
              <nav className="flex space-x-6 overflow-x-auto py-3">
                <button
                  onClick={() => scrollToSection('personal-notes')}
                  className={`flex items-center whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeSection === 'personal-notes'
                      ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                  }`}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Personal Notes
                </button>

                <button
                  onClick={() => scrollToSection('filters')}
                  className={`flex items-center whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeSection === 'filters'
                      ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                  }`}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  Filters
                </button>

                <button
                  onClick={() => scrollToSection('status-overview')}
                  className={`flex items-center whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeSection === 'status-overview'
                      ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                  }`}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Status
                </button>
                
                <button
                  onClick={() => scrollToSection('follow-up')}
                  className={`flex items-center whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeSection === 'follow-up'
                      ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                  }`}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Follow Up
                </button>

                <button
                  onClick={() => scrollToSection('recent-notes')}
                  className={`flex items-center whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeSection === 'recent-notes'
                      ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                  }`}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Recent Notes
                </button>

                <button
                  onClick={() => scrollToSection('circle-leaders')}
                  className={`flex items-center whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeSection === 'circle-leaders'
                      ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                  }`}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Leaders
                </button>
              </nav>
            </div>

          {/* Tab Content */}
          {/* First Visit Message - Campus Selection Required */}
              {isFirstVisit && filters.campus.length === 0 && (
                <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-6 w-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-lg font-medium text-blue-800 dark:text-blue-200">
                        Welcome to the Dashboard!
                      </h3>
                      <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                        <p>
                          To get started, please select at least one <strong>Campus</strong> from the filters above to view Circle Leaders. 
                          This helps ensure you see relevant data for your area.
                        </p>
                      </div>
                      <div className="mt-4">
                        <button
                          onClick={() => {
                            // Scroll to filters section
                            const filtersElement = document.querySelector('[data-testid="filters-section"]');
                            if (filtersElement) {
                              filtersElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                          }}
                          className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
                        >
                          Go to Filters
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Personal Notes Section */}
              <div id="personal-notes" className="mt-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Personal Notes
                </h2>
                <button
                  onClick={toggleUserNotesVisibility}
                  className="text-sm px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 
                           text-gray-700 dark:text-gray-300 rounded-md transition-colors"
                >
                  {userNotesVisible ? 'Hide' : 'Show'}
                </button>
              </div>
              
              {userNotesVisible && (
                <div className="space-y-4">
                  {/* Add New Note */}
                  <div className="space-y-3">
                    <div className="relative">
                      <textarea
                        value={newNoteContent}
                        onChange={(e) => setNewNoteContent(e.target.value)}
                        placeholder="Add a new personal note..."
                        className="w-full min-h-[80px] max-h-[400px] p-3 border border-gray-300 dark:border-gray-600 rounded-md 
                                 bg-white dark:bg-gray-700 text-gray-900 dark:text-white 
                                 placeholder-gray-500 dark:placeholder-gray-400
                                 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 
                                 resize-y transition-colors"
                        rows={3}
                        disabled={userNotesLoading || savingNoteId === -1}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {newNoteContent.length > 0 ? `${newNoteContent.length} characters` : ''}
                      </div>
                      <button
                        onClick={saveNewUserNote}
                        disabled={!newNoteContent.trim() || savingNoteId === -1}
                        className="inline-flex items-center px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 
                                 text-white text-sm font-medium rounded-md transition-colors disabled:cursor-not-allowed"
                      >
                        {savingNoteId === -1 ? (
                          <>
                            <svg className="animate-spin h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Saving...
                          </>
                        ) : (
                          'Save Note'
                        )}
                      </button>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      💡 Tip: Type markdown-style links like [Display Text](URL) to create clickable links
                    </div>
                  </div>

                  {/* Existing Notes */}
                  {userNotesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500 mr-2"></div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">Loading notes...</span>
                    </div>
                  ) : userNotes.length === 0 ? (
                    <div className="text-center py-6">
                      <span className="text-sm text-gray-500 dark:text-gray-400">No notes yet. Add your first note above!</span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {userNotes.map((note) => (
                        <div key={note.id} className={`p-3 rounded-md border transition-all ${
                          note.pinned 
                            ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 shadow-md' 
                            : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                        }`}>
                          {editingNoteId === note.id ? (
                            // Edit mode
                            <div className="space-y-3">
                              <textarea
                                value={editingContent}
                                onChange={(e) => {
                                  setEditingContent(e.target.value);
                                  // Auto-resize as user types
                                  const textarea = e.target as HTMLTextAreaElement;
                                  textarea.style.height = 'auto';
                                  textarea.style.height = Math.max(80, Math.min(600, textarea.scrollHeight)) + 'px';
                                }}
                                data-editing-id={note.id}
                                className="w-full min-h-[80px] max-h-[600px] p-3 border border-gray-300 dark:border-gray-600 rounded-md 
                                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white 
                                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500 
                                         resize-y transition-colors"
                                disabled={savingNoteId === note.id}
                                style={{ height: 'auto' }}
                              />
                              <div className="flex items-center justify-between">
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {editingContent.length} characters
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={cancelEditing}
                                    disabled={savingNoteId === note.id}
                                    className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 
                                             disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => updateUserNote(note.id, editingContent)}
                                    disabled={!editingContent.trim() || savingNoteId === note.id}
                                    className="inline-flex items-center px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 
                                             text-white text-sm font-medium rounded-md transition-colors disabled:cursor-not-allowed"
                                  >
                                    {savingNoteId === note.id ? (
                                      <>
                                        <svg className="animate-spin h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Saving...
                                      </>
                                    ) : (
                                      'Save'
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            // View mode
                            <div>
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  {note.pinned && (
                                    <div className="flex items-center text-yellow-600 dark:text-yellow-400">
                                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                      </svg>
                                    </div>
                                  )}
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {new Date(note.updated_at || note.created_at).toLocaleDateString('en-US', { 
                                      month: 'short', 
                                      day: 'numeric',
                                      year: 'numeric',
                                      hour: 'numeric',
                                      minute: '2-digit'
                                    })}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => togglePinNote(note.id)}
                                    className={`text-xs ${note.pinned 
                                      ? 'text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200' 
                                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                                    }`}
                                    title={note.pinned ? 'Unpin note' : 'Pin note to top'}
                                  >
                                    {note.pinned ? 'Unpin' : 'Pin'}
                                  </button>
                                  <button
                                    onClick={() => startEditingNote(note.id, note.content)}
                                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => openDeleteNoteModal(note.id, note.content)}
                                    className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                              <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                                {linkifyText(note.content)}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        {/* Active Filter Tags - Sticky */}
        <div className="sticky top-[60px] z-[999] bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-3">
            {(filters.campus.length > 0 || filters.acpd.length > 0 || filters.status.length > 0 || 
              filters.meetingDay.length > 0 || filters.circleType.length > 0 || 
              filters.eventSummary !== 'all' || filters.connected !== 'all' || filters.timeOfDay !== 'all') && (
              <div className="flex items-center flex-wrap gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">Active Filters:</span>
                
                {/* Campus Tags */}
                {filters.campus.map(campus => (
                  <span key={`campus-${campus}`} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    Campus: {campus}
                    <button
                      onClick={() => updateFilters({...filters, campus: filters.campus.filter(c => c !== campus)})}
                      className="ml-1.5 h-3 w-3 rounded-full inline-flex items-center justify-center text-blue-400 hover:bg-blue-200 hover:text-blue-600 dark:hover:bg-blue-800"
                    >
                      <span className="sr-only">Remove {campus} filter</span>
                      <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                        <path strokeLinecap="round" strokeWidth="1.5" d="m1 1 6 6m0-6-6 6" />
                      </svg>
                    </button>
                  </span>
                ))}

                {/* ACPD Tags */}
                {filters.acpd.map(acpd => (
                  <span key={`acpd-${acpd}`} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                    ACPD: {acpd}
                    <button
                      onClick={() => updateFilters({...filters, acpd: filters.acpd.filter(a => a !== acpd)})}
                      className="ml-1.5 h-3 w-3 rounded-full inline-flex items-center justify-center text-purple-400 hover:bg-purple-200 hover:text-purple-600 dark:hover:bg-purple-800"
                    >
                      <span className="sr-only">Remove {acpd} filter</span>
                      <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                        <path strokeLinecap="round" strokeWidth="1.5" d="m1 1 6 6m0-6-6 6" />
                      </svg>
                    </button>
                  </span>
                ))}

                {/* Status Tags */}
                {filters.status.map(status => (
                  <span key={`status-${status}`} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    Status: {status === 'follow-up' ? 'Follow Up' : status.charAt(0).toUpperCase() + status.slice(1)}
                    <button
                      onClick={() => updateFilters({...filters, status: filters.status.filter(s => s !== status)})}
                      className="ml-1.5 h-3 w-3 rounded-full inline-flex items-center justify-center text-green-400 hover:bg-green-200 hover:text-green-600 dark:hover:bg-green-800"
                    >
                      <span className="sr-only">Remove {status} filter</span>
                      <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                        <path strokeLinecap="round" strokeWidth="1.5" d="m1 1 6 6m0-6-6 6" />
                      </svg>
                    </button>
                  </span>
                ))}

                {/* Meeting Day Tags */}
                {filters.meetingDay.map(day => (
                  <span key={`day-${day}`} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                    Day: {day}
                    <button
                      onClick={() => updateFilters({...filters, meetingDay: filters.meetingDay.filter(d => d !== day)})}
                      className="ml-1.5 h-3 w-3 rounded-full inline-flex items-center justify-center text-orange-400 hover:bg-orange-200 hover:text-orange-600 dark:hover:bg-orange-800"
                    >
                      <span className="sr-only">Remove {day} filter</span>
                      <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                        <path strokeLinecap="round" strokeWidth="1.5" d="m1 1 6 6m0-6-6 6" />
                      </svg>
                    </button>
                  </span>
                ))}

                {/* Circle Type Tags */}
                {filters.circleType.map(type => (
                  <span key={`type-${type}`} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                    Type: {type}
                    <button
                      onClick={() => updateFilters({...filters, circleType: filters.circleType.filter(t => t !== type)})}
                      className="ml-1.5 h-3 w-3 rounded-full inline-flex items-center justify-center text-indigo-400 hover:bg-indigo-200 hover:text-indigo-600 dark:hover:bg-indigo-800"
                    >
                      <span className="sr-only">Remove {type} filter</span>
                      <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                        <path strokeLinecap="round" strokeWidth="1.5" d="m1 1 6 6m0-6-6 6" />
                      </svg>
                    </button>
                  </span>
                ))}

                {/* Event Summary Tags */}
                {filters.eventSummary !== 'all' && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                    Event Summary: {filters.eventSummary === 'received' ? 'Received' : 'Not Received'}
                    <button
                      onClick={() => updateFilters({...filters, eventSummary: 'all'})}
                      className="ml-1.5 h-3 w-3 rounded-full inline-flex items-center justify-center text-yellow-400 hover:bg-yellow-200 hover:text-yellow-600 dark:hover:bg-yellow-800"
                    >
                      <span className="sr-only">Remove event summary filter</span>
                      <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                        <path strokeLinecap="round" strokeWidth="1.5" d="m1 1 6 6m0-6-6 6" />
                      </svg>
                    </button>
                  </span>
                )}

                {/* Connected Tags */}
                {filters.connected !== 'all' && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200">
                    Connection: {filters.connected === 'connected' ? 'Connected' : 'Not Connected'}
                    <button
                      onClick={() => updateFilters({...filters, connected: 'all'})}
                      className="ml-1.5 h-3 w-3 rounded-full inline-flex items-center justify-center text-teal-400 hover:bg-teal-200 hover:text-teal-600 dark:hover:bg-teal-800"
                    >
                      <span className="sr-only">Remove connection filter</span>
                      <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                        <path strokeLinecap="round" strokeWidth="1.5" d="m1 1 6 6m0-6-6 6" />
                      </svg>
                    </button>
                  </span>
                )}

                {/* Time of Day Tags */}
                {filters.timeOfDay !== 'all' && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200">
                    Time: {filters.timeOfDay === 'am' ? 'AM' : 'PM'}
                    <button
                      onClick={() => updateFilters({...filters, timeOfDay: 'all'})}
                      className="ml-1.5 h-3 w-3 rounded-full inline-flex items-center justify-center text-pink-400 hover:bg-pink-200 hover:text-pink-600 dark:hover:bg-pink-800"
                    >
                      <span className="sr-only">Remove time filter</span>
                      <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                        <path strokeLinecap="round" strokeWidth="1.5" d="m1 1 6 6m0-6-6 6" />
                      </svg>
                    </button>
                  </span>
                )}

                {/* Clear All Button */}
                <button
                  onClick={clearAllFilters}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 ml-2"
                >
                  Clear All
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div id="filters" data-testid="filters-section" className="mt-6">
          {/* Show loading state while reference data is loading */}
          {referenceDataLoading && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <p className="text-gray-600 dark:text-gray-400">Loading filters...</p>
            </div>
          )}
          
          {/* Show FilterPanel when data is loaded */}
          {!referenceDataLoading && (
            <FilterPanel 
            filters={filters}
            onFiltersChange={updateFilters}
            onClearAllFilters={clearAllFilters}
            onBulkUpdateStatus={handleBulkUpdateStatus}
            onResetCheckboxes={handleResetCheckboxes}
            totalLeaders={filteredLeaders.length}
            receivedCount={eventSummaryProgress.received}
            onAddNote={(leaderId, name) => openAddNoteModal(leaderId, name)}
            onClearFollowUp={handleClearFollowUp}
            refreshKey={filterPanelRefreshKey}
            directors={directors}
            campuses={campuses}
            statuses={statuses}
            circleTypes={circleTypes}
            frequencies={frequencies}
          />
          )}
        </div>

        {/* Status Bar */}
        <div id="status-overview" className="mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="mb-4">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Status Overview</h2>
            </div>
            <CircleStatusBar
              data={statusData}
              total={filters.campus.length > 0 ? 
                circleLeaders.filter(leader => filters.campus.includes(leader.campus || '')).length : 
                circleLeaders.length
              }
              onStatusClick={handleStatusBarClick}
            />
          </div>
        </div>

        {/* Progress Section */}
        <div id="progress">
          {/* Event Summary Progress */}
          <EventSummaryProgress
            receivedCount={eventSummaryProgress.received}
            totalCount={eventSummaryProgress.total}
            onResetCheckboxes={handleResetCheckboxes}
          />

          {/* Connections Progress */}
          <ConnectionsProgress
            filteredLeaderIds={filteredLeaderIds}
            totalFilteredLeaders={filteredLeaders.length}
          />
        </div>

        {/* Follow Up Section */}
        <div id="follow-up">
          <FollowUpTable
            selectedCampuses={filters.campus}
            onAddNote={(leaderId, name) => openAddNoteModal(leaderId, name)}
            onClearFollowUp={handleClearFollowUp}
            refreshKey={filterPanelRefreshKey}
          />
        </div>

        {/* Today's Circles */}
        <div id="today-circles">
          <TodayCircles 
            todayCircles={todayCircles}
            onOpenContactModal={openContactModal}
          />
        </div>

        {/* Recent Notes */}
        <div id="recent-notes" className="mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">Recent Notes</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Filtered by current dashboard settings ({filteredLeaders.length} leaders)
                </p>
              </div>
              <div className="flex items-center gap-2">
                {recentNotesLoading && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">Loading...</span>
                )}
                <button
                  onClick={toggleRecentNotesVisibility}
                  className="text-sm px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  {recentNotesVisible ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            {recentNotesVisible && (
              <>
                {/* Desktop Table View */}
                <div className="hidden sm:block overflow-x-auto -mx-4 sm:mx-0">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900/40">
                      <tr>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Circle Leader</th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Note</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {recentNotesLoading ? (
                        <tr>
                          <td colSpan={3} className="px-4 sm:px-6 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                            <div className="flex items-center justify-center">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500 mr-2"></div>
                              Loading recent notes...
                            </div>
                          </td>
                        </tr>
                      ) : recentNotes.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 sm:px-6 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                            No recent notes
                          </td>
                        </tr>
                      ) : (
                        recentNotes.map((note) => {
                          const leader = circleLeaders.find(l => l.id === note.circle_leader_id);
                          const leaderName = leader?.name || `Leader #${note.circle_leader_id}`;
                          const dateStr = new Date(note.created_at).toLocaleString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: '2-digit',
                            hour: 'numeric',
                            minute: '2-digit'
                          });
                          return (
                            <tr key={note.id}>
                              <td className="px-4 sm:px-6 py-3 whitespace-nowrap">
                                {leader ? (
                                  <Link href={`/circle/${note.circle_leader_id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                                    {leaderName}
                                  </Link>
                                ) : (
                                  <span className="text-gray-700 dark:text-gray-300">{leaderName}</span>
                                )}
                              </td>
                              <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                                {dateStr}
                              </td>
                              <td className="px-4 sm:px-6 py-3 text-gray-800 dark:text-gray-200">
                                <div className="max-w-3xl whitespace-pre-wrap break-words">
                                  {linkifyText(note.content)}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="sm:hidden space-y-4">
                  {recentNotesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500 mr-2"></div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">Loading recent notes...</span>
                    </div>
                  ) : recentNotes.length === 0 ? (
                    <div className="text-center py-8">
                      <span className="text-sm text-gray-500 dark:text-gray-400">No recent notes</span>
                    </div>
                  ) : (
                    recentNotes.map((note) => {
                      const leader = circleLeaders.find(l => l.id === note.circle_leader_id);
                      const leaderName = leader?.name || `Leader #${note.circle_leader_id}`;
                      const dateStr = new Date(note.created_at).toLocaleString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: 'numeric',
                        minute: '2-digit'
                      });
                      return (
                        <div key={note.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                          {/* Circle Leader Name */}
                          <div className="mb-2">
                            <div className="font-medium text-gray-900 dark:text-white">
                              {leader ? (
                                <Link href={`/circle/${note.circle_leader_id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                                  {leaderName}
                                </Link>
                              ) : (
                                <span>{leaderName}</span>
                              )}
                            </div>
                          </div>
                          
                          {/* Date of Note */}
                          <div className="mb-3">
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {dateStr}
                            </div>
                          </div>
                          
                          {/* Note */}
                          <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                            {linkifyText(note.content)}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Circle Leaders Grid */}
        <div id="circle-leaders" className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Circle Leaders
              </h2>
              <div className="flex items-center space-x-4">
                {/* Items per page selector */}
                <div className="flex items-center space-x-2">
                  <label htmlFor="items-per-page" className="text-sm text-gray-600 dark:text-gray-400">
                    Show:
                  </label>
                  <select
                    id="items-per-page"
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                    className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={-1}>All</option>
                  </select>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {itemsPerPage === -1 ? (
                    `${filteredLeaders.length} of ${circleLeaders.length} leaders`
                  ) : (
                    `${startIndex + 1}-${Math.min(endIndex, filteredLeaders.length)} of ${filteredLeaders.length} leaders`
                  )}
                </div>
              </div>
            </div>          {isLoading ? (
            <div className="space-y-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 pr-6">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                    </div>
                    <div className="flex-1 px-6">
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                    </div>
                    <div className="flex space-x-2">
                      <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
                      <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
                      <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredLeaders.length === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <svg 
                className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth="2" 
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                No Circle Leaders found
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Try adjusting your filters or search terms.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {paginatedLeaders.map(leader => (
                <CircleLeaderCard
                  key={leader.id}
                  leader={leader}
                  onToggleEventSummary={handleToggleEventSummary}
                  onOpenContactModal={openContactModal}
                  onLogConnection={openLogConnectionModal}
                  onAddNote={(leaderId, name) => openAddNoteModal(leaderId, name)}
                  onClearFollowUp={handleClearFollowUp}
                  onUpdateStatus={handleUpdateStatus}
                  onToggleFollowUp={toggleFollowUp}
                  isAdmin={isAdmin}
                  statuses={statuses}
                />
              ))}
            </div>
          )}
          
          {/* Pagination Controls */}
          {itemsPerPage !== -1 && totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Previous
                </button>
                
                {/* Page numbers */}
                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`px-3 py-2 text-sm font-medium rounded-md ${
                          currentPage === pageNum
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-500 bg-white border border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

            {/* Circle Visits Tab - Commented out for now
            {activeTab === 'visits' && (
              <CircleVisitsDashboard 
                campusFilter={filters.campus}
                acpdFilter={filters.acpd}
              />
            )}
            */}
      </div>

      {/* Contact Modal */}
      <ContactModal 
        isOpen={contactModal.isOpen}
        name={contactModal.name}
        email={contactModal.email}
        phone={contactModal.phone}
        onClose={closeContactModal}
      />

      {/* Log Connection Modal */}
      <LogConnectionModal
        isOpen={logConnectionModal.isOpen}
        onClose={closeLogConnectionModal}
        circleLeaderId={logConnectionModal.leaderId}
        circleLeaderName={logConnectionModal.name}
        onConnectionLogged={handleConnectionLogged}
      />

      {/* Add Note Modal */}
      <AddNoteModal
        isOpen={addNoteModal.isOpen}
        onClose={closeAddNoteModal}
        circleLeaderId={addNoteModal.leaderId}
        circleLeaderName={addNoteModal.name}
        clearFollowUp={addNoteModal.clearFollowUp}
        onNoteAdded={handleNoteAdded}
      />

      {/* Reset Confirmation Modal */}
      <ConfirmModal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={confirmResetCheckboxes}
        title="Reset Event Summary Status"
        message={`This will reset the Event Summary status to "Not Received" for all ${filteredLeaders.length} currently visible Circle Leaders. Are you sure?`}
        confirmText="Reset All"
        cancelText="Cancel"
        type="warning"
      />

      {/* Alert Modal */}
      <AlertModal
        isOpen={showAlert.isOpen}
        onClose={() => setShowAlert({ ...showAlert, isOpen: false })}
        type={showAlert.type}
        title={showAlert.title}
        message={showAlert.message}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={exportModal}
        onClose={() => setExportModal(false)}
        leaders={filteredLeaders}
      />

      {/* Delete Note Confirmation Modal */}
      {deleteNoteModal.isOpen && (
        <div className="fixed inset-0 bg-gray-600 dark:bg-gray-900 bg-opacity-50 dark:bg-opacity-75 overflow-y-auto h-full w-full z-[9999]">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
            <div className="mt-3 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20">
                <svg
                  className="h-6 w-6 text-red-600 dark:text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white mt-4">
                Delete Note
              </h3>
              <div className="mt-4 px-7 py-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Are you sure you want to delete this note? This action cannot be undone and the note will be deleted forever.
                </p>
                {deleteNoteModal.content && (
                  <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-md border max-h-32 overflow-y-auto">
                    <p className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-words">
                      {deleteNoteModal.content.length > 200 
                        ? `${deleteNoteModal.content.substring(0, 200)}...` 
                        : deleteNoteModal.content
                      }
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-3 px-4 py-3">
                <button
                  onClick={() => copyNoteToClipboard(deleteNoteModal.content)}
                  className="flex-1 inline-flex justify-center items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy Contents
                </button>
                <button
                  onClick={confirmDeleteNote}
                  className="flex-1 inline-flex justify-center items-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
                <button
                  onClick={closeDeleteNoteModal}
                  className="flex-1 inline-flex justify-center items-center px-4 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-md transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </ProtectedRoute>
  );
}
