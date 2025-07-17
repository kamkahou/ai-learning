import { useTranslate } from '@/hooks/common-hooks';
import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import { message } from 'antd';
import { useCallback, useState } from 'react';

interface Props {
  text: string;
}

const CopyToClipboard = ({ text }: Props) => {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslate('common');

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      message.success(t('copied'));
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      // 备用方案：使用传统的复制方法
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        message.success(t('copied'));
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      } catch (fallbackError) {
        message.error('复制失败');
        console.error('复制失败:', fallbackError);
      }
      document.body.removeChild(textArea);
    }
  }, [text, t]);

  return (
    <span
      onClick={handleCopy}
      style={{
        display: 'inline-block',
        cursor: 'pointer',
        padding: '2px 4px',
        borderRadius: '2px',
        transition: 'background-color 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.04)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
      title={copied ? t('copied') : t('copy')}
    >
      {copied ? (
        <CheckOutlined style={{ color: '#52c41a' }} />
      ) : (
        <CopyOutlined />
      )}
    </span>
  );
};

export default CopyToClipboard;
