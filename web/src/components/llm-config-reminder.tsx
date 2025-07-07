import { ExclamationCircleOutlined } from '@ant-design/icons';
import { Alert, Button, Modal, Typography } from 'antd';
import React from 'react';
import { useTranslation } from 'react-i18next';

const { Title, Paragraph } = Typography;

interface LlmConfigReminderProps {
  visible: boolean;
  onClose: () => void;
  onGoToSettings: () => void;
}

export const LlmConfigReminder: React.FC<LlmConfigReminderProps> = ({
  visible,
  onClose,
  onGoToSettings,
}) => {
  const { t } = useTranslation('common');

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ExclamationCircleOutlined style={{ color: '#faad14' }} />
          {t('llmConfigReminder.title', 'LLM Configuration Required')}
        </div>
      }
      open={visible}
      onCancel={onClose}
      closable={true}
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t('llmConfigReminder.later', 'Later')}
        </Button>,
        <Button key="settings" type="primary" onClick={onGoToSettings}>
          {t('llmConfigReminder.goToSettings', 'Go to Settings')}
        </Button>,
      ]}
      width={500}
    >
      <Alert
        message={t('llmConfigReminder.alertTitle', 'Configuration Needed')}
        description={t(
          'llmConfigReminder.alertDescription',
          'Please configure at least one LLM model to enable chat functionality for all users.',
        )}
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Paragraph>
        {t(
          'llmConfigReminder.description',
          'As an administrator, you need to configure LLM settings before users can start chatting. Once you configure the LLM models, all users will be able to inherit these settings and use the chat functionality.',
        )}
      </Paragraph>

      <Paragraph strong>
        {t(
          'llmConfigReminder.instruction',
          'You can configure LLM models in User Settings > Model Configuration.',
        )}
      </Paragraph>
    </Modal>
  );
};

export default LlmConfigReminder;
