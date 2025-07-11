import { useFetchUserInfo } from '@/hooks/user-setting-hooks';
import {
  BarChartOutlined,
  EditOutlined,
  ReloadOutlined,
  UndoOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  message,
} from 'antd';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface TokenUsageRecord {
  user_id: string;
  nickname: string;
  email: string;
  is_superuser: boolean;
  llm_type: string;
  llm_name: string;
  used_tokens: number;
  token_limit: number;
  reset_date: string;
  is_active: boolean;
  create_date: string;
  update_date: string;
}

interface TokenStatistics {
  total_users: number;
  users_with_limits: number;
  total_tokens_used: number;
  tokens_by_type: Record<string, number>;
  statistics_date: string;
}

const AdminTokenManagement: React.FC = () => {
  const { t } = useTranslation();
  const { data: userInfo } = useFetchUserInfo();
  const [loading, setLoading] = useState(false);
  const [tokenUsageData, setTokenUsageData] = useState<TokenUsageRecord[]>([]);
  const [statistics, setStatistics] = useState<TokenStatistics | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TokenUsageRecord | null>(
    null,
  );
  const [form] = Form.useForm();

  const fetchTokenStatistics = async () => {
    try {
      const response = await fetch('/api/v1/admin/token_usage/statistics', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userInfo?.access_token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.retcode === 0) {
          setStatistics(result.data);
        }
      }
    } catch (error) {
      console.error('Error fetching token statistics:', error);
    }
  };

  const fetchTokenUsageData = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        '/api/v1/admin/token_usage/users?limit=100&offset=0',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${userInfo?.access_token}`,
          },
        },
      );

      if (response.ok) {
        const result = await response.json();
        if (result.retcode === 0) {
          setTokenUsageData(result.data || []);
        } else {
          message.error(result.retmsg || 'Failed to fetch token usage data');
        }
      } else {
        message.error('Failed to fetch token usage data');
      }
    } catch (error) {
      console.error('Error fetching token usage:', error);
      message.error('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSetTokenLimit = async (values: any) => {
    try {
      const response = await fetch('/api/v1/token_usage/set_limit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userInfo?.access_token}`,
        },
        body: JSON.stringify({
          user_id: editingRecord?.user_id,
          llm_type: values.llm_type,
          llm_name: values.llm_name,
          token_limit: values.token_limit,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.retcode === 0) {
          message.success('Token limit updated successfully');
          setEditModalVisible(false);
          fetchTokenUsageData();
        } else {
          message.error(result.retmsg || 'Failed to update token limit');
        }
      } else {
        message.error('Failed to update token limit');
      }
    } catch (error) {
      console.error('Error updating token limit:', error);
      message.error('Network error occurred');
    }
  };

  const handleResetTokenUsage = async (record: TokenUsageRecord) => {
    Modal.confirm({
      title: t('confirmResetTokenUsage'),
      content: t('resetTokenUsageWarning'),
      onOk: async () => {
        try {
          const response = await fetch('/api/v1/token_usage/reset', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${userInfo?.access_token}`,
            },
            body: JSON.stringify({
              user_id: record.user_id,
              llm_type: record.llm_type,
              llm_name: record.llm_name,
            }),
          });

          if (response.ok) {
            const result = await response.json();
            if (result.retcode === 0) {
              message.success('Token usage reset successfully');
              fetchTokenUsageData();
            } else {
              message.error(result.retmsg || 'Failed to reset token usage');
            }
          } else {
            message.error('Failed to reset token usage');
          }
        } catch (error) {
          console.error('Error resetting token usage:', error);
          message.error('Network error occurred');
        }
      },
    });
  };

  useEffect(() => {
    if (userInfo?.is_superuser) {
      fetchTokenStatistics();
      fetchTokenUsageData();
    }
  }, [userInfo]);

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

  const columns = [
    {
      title: t('user'),
      key: 'user',
      width: 180,
      render: (_: any, record: TokenUsageRecord) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>
            {record.nickname}
            {record.is_superuser && (
              <Tag color="gold" style={{ marginLeft: '4px' }}>
                Admin
              </Tag>
            )}
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>{record.email}</div>
        </div>
      ),
    },
    {
      title: t('llmType'),
      dataIndex: 'llm_type',
      key: 'llm_type',
      width: 100,
      render: (type: string) => {
        const typeMap: { [key: string]: string } = {
          CHAT: t('chat'),
          EMBEDDING: t('embedding'),
          RERANK: t('rerank'),
          IMAGE2TEXT: t('image2text'),
          ASR: t('asr'),
          TTS: t('tts'),
        };
        return typeMap[type] || type;
      },
    },
    {
      title: t('model'),
      dataIndex: 'llm_name',
      key: 'llm_name',
      width: 150,
    },
    {
      title: t('usage'),
      key: 'usage',
      width: 200,
      render: (_: any, record: TokenUsageRecord) => {
        const percentage = getUsagePercentage(
          record.used_tokens,
          record.token_limit,
        );
        const color = getStatusColor(record.used_tokens, record.token_limit);

        return (
          <div>
            <Progress
              percent={record.token_limit === 0 ? 0 : percentage}
              strokeColor={color}
              size="small"
              showInfo={false}
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              {record.token_limit === 0
                ? `${formatNumber(record.used_tokens)} / ${t('unlimited')}`
                : `${formatNumber(record.used_tokens)} / ${formatNumber(record.token_limit)}`}
            </div>
          </div>
        );
      },
    },
    {
      title: t('resetDate'),
      dataIndex: 'reset_date',
      key: 'reset_date',
      width: 120,
      render: (date: string) =>
        date ? new Date(date).toLocaleDateString() : '-',
    },
    {
      title: t('actions'),
      key: 'actions',
      width: 120,
      render: (_: any, record: TokenUsageRecord) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingRecord(record);
              form.setFieldsValue({
                llm_type: record.llm_type,
                llm_name: record.llm_name,
                token_limit: record.token_limit,
              });
              setEditModalVisible(true);
            }}
          />
          <Button
            type="text"
            size="small"
            icon={<UndoOutlined />}
            onClick={() => handleResetTokenUsage(record)}
          />
        </Space>
      ),
    },
  ];

  if (!userInfo?.is_superuser) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <p>{t('adminAccessRequired')}</p>
      </div>
    );
  }

  return (
    <div className="admin-token-management">
      {/* 統計卡片 */}
      {statistics && (
        <Row gutter={16} style={{ marginBottom: '24px' }}>
          <Col span={6}>
            <Card>
              <Statistic
                title={t('totalUsers')}
                value={statistics.total_users}
                prefix={<UserOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title={t('usersWithLimits')}
                value={statistics.users_with_limits}
                prefix={<BarChartOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title={t('totalTokensUsed')}
                value={formatNumber(statistics.total_tokens_used)}
                prefix={<BarChartOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title={t('activeUsers')}
                value={Math.round(
                  (statistics.users_with_limits / statistics.total_users) * 100,
                )}
                suffix="%"
                prefix={<BarChartOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* 用戶 Token 使用表格 */}
      <Card
        title={
          <Space>
            <span>{t('userTokenUsageManagement')}</span>
            <Button
              type="text"
              icon={<ReloadOutlined />}
              onClick={() => {
                fetchTokenStatistics();
                fetchTokenUsageData();
              }}
              loading={loading}
              size="small"
            />
          </Space>
        }
      >
        <Spin spinning={loading}>
          <Table
            columns={columns}
            dataSource={tokenUsageData}
            rowKey={(record) =>
              `${record.user_id}-${record.llm_type}-${record.llm_name}`
            }
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) =>
                t('showingRecords', { start: range[0], end: range[1], total }),
            }}
            size="small"
          />
        </Spin>
      </Card>

      {/* 編輯 Token 限制對話框 */}
      <Modal
        title={t('editTokenLimit')}
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        footer={null}
      >
        <Form form={form} onFinish={handleSetTokenLimit} layout="vertical">
          <Form.Item name="llm_type" label={t('llmType')}>
            <Input disabled />
          </Form.Item>
          <Form.Item name="llm_name" label={t('model')}>
            <Input disabled />
          </Form.Item>
          <Form.Item
            name="token_limit"
            label={t('tokenLimit')}
            rules={[{ required: true, message: t('tokenLimitRequired') }]}
          >
            <InputNumber
              min={0}
              placeholder={t('tokenLimitPlaceholder')}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button onClick={() => setEditModalVisible(false)}>
                {t('cancel')}
              </Button>
              <Button type="primary" htmlType="submit">
                {t('save')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminTokenManagement;
