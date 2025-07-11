import { useFetchUserInfo } from '@/hooks/user-setting-hooks';
import { App, Progress, Space, Spin, Typography } from 'antd';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './index.less';

const { Text } = Typography;

interface TokenUsageRecord {
  llm_type: string;
  llm_name: string;
  used_tokens: number;
  token_limit: number;
  reset_date: string;
  is_active: boolean;
}

const TokenUsageBar: React.FC = () => {
  const { t } = useTranslation();
  const { data: userInfo } = useFetchUserInfo();
  const { message } = App.useApp();
  const [tokenUsageData, setTokenUsageData] = useState<TokenUsageRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // 只有普通用戶才顯示 token 使用條
  if (userInfo?.is_superuser) {
    return null;
  }

  const fetchTokenUsage = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/token_usage', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (response.ok) {
        const result = await response.json();
        if (result.retcode === 0) {
          setTokenUsageData(result.data || []);
        }
      }
    } catch (error) {
      console.error('Error fetching token usage:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokenUsage();
  }, []);

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  const getUsagePercentage = (used: number, limit: number) => {
    if (limit === 0) return 0;
    return Math.min((used / limit) * 100, 100);
  };

  const getStatusColor = (used: number, limit: number) => {
    if (limit === 0) return '#52c41a';
    const percentage = (used / limit) * 100;
    if (percentage >= 90) return '#ff4d4f';
    if (percentage >= 75) return '#faad14';
    return '#52c41a';
  };

  // 找到聊天類型的 token 使用情況
  const chatUsage = tokenUsageData.find((item) => item.llm_type === 'CHAT');

  if (loading || !chatUsage) {
    return loading ? (
      <div className={styles.tokenUsageBar}>
        <Spin size="small" />
        <Text type="secondary" style={{ marginLeft: 8 }}>
          {t('loadingTokenUsage')}
        </Text>
      </div>
    ) : null;
  }

  const percentage = getUsagePercentage(
    chatUsage.used_tokens,
    chatUsage.token_limit,
  );
  const color = getStatusColor(chatUsage.used_tokens, chatUsage.token_limit);

  return (
    <div className={styles.tokenUsageBar}>
      <Space size="small" align="center" style={{ width: '100%' }}>
        <Text type="secondary" style={{ fontSize: '12px', minWidth: '50px' }}>
          Token:
        </Text>
        <Progress
          percent={chatUsage.token_limit === 0 ? 0 : percentage}
          strokeColor={color}
          size="small"
          showInfo={false}
          style={{ flex: 1, minWidth: '100px' }}
        />
        <Text style={{ fontSize: '12px', color: '#666', minWidth: '80px' }}>
          {chatUsage.token_limit === 0
            ? t('unlimited')
            : `${formatNumber(chatUsage.used_tokens)} / ${formatNumber(chatUsage.token_limit)}`}
        </Text>
        {chatUsage.reset_date && (
          <Text type="secondary" style={{ fontSize: '11px' }}>
            重置: {new Date(chatUsage.reset_date).toLocaleDateString()}
          </Text>
        )}
      </Space>
    </div>
  );
};

export default TokenUsageBar;
