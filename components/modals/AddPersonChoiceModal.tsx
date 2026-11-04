'use client';

import { MessageSquareText, UserRoundPlus, ChevronRight } from 'lucide-react';
import Modal from '../ui/Modal';

interface AddPersonChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  leaderName: string;
  onInvite: () => void;
  onConnect: () => void;
}

/** Asks which way to add a new person to a circle, then hands off to the existing modal. */
export default function AddPersonChoiceModal({
  isOpen,
  onClose,
  leaderName,
  onInvite,
  onConnect,
}: AddPersonChoiceModalProps) {
  const leaderFirstName = leaderName.split(' ')[0] || 'the leader';

  const options = [
    {
      key: 'invite',
      Icon: MessageSquareText,
      title: 'Invite them to this circle',
      detail: `Text the new person ${leaderFirstName}'s circle details.`,
      onClick: onInvite,
    },
    {
      key: 'connect',
      Icon: UserRoundPlus,
      title: `Connect them with ${leaderFirstName}`,
      detail: `Text ${leaderFirstName} the new person's contact info.`,
      onClick: onConnect,
    },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add a person" size="md">
      <div className="space-y-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Who should get the text?
        </p>
        {options.map(({ key, Icon, title, detail, onClick }) => (
          <button
            key={key}
            type="button"
            onClick={onClick}
            data-testid={`add-person-${key}`}
            className="group w-full min-h-[44px] flex items-center gap-3 text-left px-4 py-3 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] hover:border-[#34B233] hover:bg-[#34B233]/5 dark:hover:bg-[#34B233]/10 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#34B233] transition"
          >
            <span className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-[#34B233]/10 text-[#34B233]">
              <Icon className="w-5 h-5" aria-hidden="true" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
              <span className="block text-sm text-gray-500 dark:text-gray-400">{detail}</span>
            </span>
            <ChevronRight className="w-4 h-4 flex-shrink-0 text-gray-400 group-hover:text-[#34B233]" aria-hidden="true" />
          </button>
        ))}
      </div>
    </Modal>
  );
}
