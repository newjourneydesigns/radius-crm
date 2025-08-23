'use client';

import Modal from '../ui/Modal';

interface ContactModalProps {
  isOpen: boolean;
  name: string;
  email: string;
  phone: string;
  onClose: () => void;
}

export default function ContactModal({ isOpen, name, email, phone, onClose }: ContactModalProps) {
  const handleCall = () => {
    if (phone) {
      window.open(`tel:${phone}`, '_self');
      onClose();
    }
  };

  const handleText = () => {
    if (phone) {
      window.open(`sms:${phone}`, '_self');
      onClose();
    }
  };

  const handleEmail = () => {
    if (email) {
      window.open(`mailto:${email}`, '_blank');
      onClose();
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={`Contact ${name || 'Circle Leader'}`}
      size="sm"
    >
      <div className="space-y-3">
        <div className="text-center pb-2">
          <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100/10 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200/20 dark:border-blue-800/30">
            {[phone && `${phone}`, email && `${email}`].filter(Boolean).join(' • ')}
          </div>
        </div>
        
        <div className="flex flex-col space-y-2">
          {phone && (
            <>
              <button
                onClick={handleCall}
                className="group flex items-center justify-center px-4 py-3 bg-green-600/90 hover:bg-green-600 text-white rounded-xl font-medium text-sm tracking-tight transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
              >
                <svg className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Call
              </button>
              
              <button
                onClick={handleText}
                className="group flex items-center justify-center px-4 py-3 bg-blue-600/90 hover:bg-blue-600 text-white rounded-xl font-medium text-sm tracking-tight transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
              >
                <svg className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Send Text
              </button>
            </>
          )}
          
          {email && (
            <button
              onClick={handleEmail}
              className="group flex items-center justify-center px-4 py-3 bg-blue-600/90 hover:bg-blue-600 text-white rounded-xl font-medium text-sm tracking-tight transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
            >
              <svg className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Send Email
            </button>
          )}
          
          {!phone && !email && (
            <div className="text-center py-8">
              <div className="w-12 h-12 mx-auto mb-3 bg-gray-100/10 dark:bg-gray-800/20 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                No contact information available
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
