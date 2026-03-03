'use client';

import ProtectedRoute from '../../components/ProtectedRoute';
import RadiusAssistant from '../../components/ai-assistant/RadiusAssistant';

export default function AssistantPage() {
  return (
    <ProtectedRoute>
      <div style={{ padding: '20px 16px', maxWidth: '100%' }}>
        <RadiusAssistant fullPage />
      </div>
    </ProtectedRoute>
  );
}
