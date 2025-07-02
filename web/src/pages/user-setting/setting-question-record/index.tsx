import {
  DeleteOutlined,
  ExportOutlined,
  EyeOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tooltip,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import React, { useEffect, useState } from 'react';

const { RangePicker } = DatePicker;
const { Option } = Select;

interface QuestionRecord {
  id: string;
  user_id: string;
  question: string;
  dialog_id?: string;
  conversation_id?: string;
  source: string;
  ip_address?: string;
  create_time: number;
  create_date: string;
  nickname?: string;
  email?: string;
}

interface QuestionStats {
  total_questions: number;
  source_stats: Array<{ source: string; count: number }>;
  daily_stats: Array<{ date: string; count: number }>;
}

const QuestionRecordManagement: React.FC = () => {
  const [data, setData] = useState<QuestionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [stats, setStats] = useState<QuestionStats>({
    total_questions: 0,
    source_stats: [],
    daily_stats: [],
  });

  // 搜索條件
  const [keyword, setKeyword] = useState('');
  const [source, setSource] = useState<string>('');
  const [userId, setUserId] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(
    null,
  );

  // 選中的記錄
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  // 詳情模態框
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<QuestionRecord | null>(
    null,
  );

  // 獲取問題記錄列表
  const fetchQuestionList = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        page_size: pageSize.toString(),
        orderby: 'create_time',
        desc: 'true',
      });

      if (keyword) params.append('keyword', keyword);
      if (source) params.append('source', source);
      if (userId) params.append('user_id', userId);
      if (dateRange) {
        params.append('start_date', dateRange[0].format('YYYY-MM-DD'));
        params.append('end_date', dateRange[1].format('YYYY-MM-DD'));
      }

      const response = await fetch(`/api/v1/question_record/list?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.code === 0) {
          setData(result.data.list);
          setTotal(result.data.total);
        } else {
          message.error(result.message || '獲取問題記錄失敗');
        }
      } else {
        message.error('請求失敗');
      }
    } catch (error) {
      console.error('獲取問題記錄失敗:', error);
      message.error('獲取問題記錄失敗');
    } finally {
      setLoading(false);
    }
  };

  // 獲取統計信息
  const fetchStats = async () => {
    try {
      const params = new URLSearchParams();
      if (dateRange) {
        params.append('start_date', dateRange[0].format('YYYY-MM-DD'));
        params.append('end_date', dateRange[1].format('YYYY-MM-DD'));
      }

      const response = await fetch(`/api/v1/question_record/stats?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.code === 0) {
          setStats(result.data);
        }
      }
    } catch (error) {
      console.error('獲取統計信息失敗:', error);
    }
  };

  // 刪除記錄
  const handleDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('請選擇要刪除的記錄');
      return;
    }

    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除 ${selectedRowKeys.length} 條記錄嗎？此操作不可恢復。`,
      onOk: async () => {
        try {
          const response = await fetch('/api/v1/question_record/delete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              question_ids: selectedRowKeys,
            }),
          });

          if (response.ok) {
            const result = await response.json();
            if (result.code === 0) {
              message.success(`成功刪除 ${result.data.deleted_count} 條記錄`);
              setSelectedRowKeys([]);
              fetchQuestionList();
              fetchStats();
            } else {
              message.error(result.message || '刪除失敗');
            }
          } else {
            message.error('刪除失敗');
          }
        } catch (error) {
          console.error('刪除失敗:', error);
          message.error('刪除失敗');
        }
      },
    });
  };

  // 導出數據
  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (keyword) params.append('keyword', keyword);
      if (source) params.append('source', source);
      if (userId) params.append('user_id', userId);
      if (dateRange) {
        params.append('start_date', dateRange[0].format('YYYY-MM-DD'));
        params.append('end_date', dateRange[1].format('YYYY-MM-DD'));
      }

      const response = await fetch(`/api/v1/question_record/export?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.code === 0) {
          // 將數據轉換為 CSV 格式並下載
          const csvContent = convertToCSV(result.data);
          downloadCSV(csvContent, 'question_records.csv');
          message.success('導出成功');
        } else {
          message.error(result.message || '導出失敗');
        }
      } else {
        message.error('導出失敗');
      }
    } catch (error) {
      console.error('導出失敗:', error);
      message.error('導出失敗');
    }
  };

  // 轉換為 CSV 格式
  const convertToCSV = (data: QuestionRecord[]) => {
    const headers = ['創建時間', '用戶', '問題內容', '來源', 'IP地址'];
    const rows = data.map((record) => [
      record.create_date,
      record.nickname || record.email || record.user_id,
      `"${record.question.replace(/"/g, '""')}"`, // 處理引號
      record.source,
      record.ip_address || '',
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.join(','))
      .join('\n');

    return '\uFEFF' + csvContent; // 添加 BOM 以支持中文
  };

  // 下載 CSV 文件
  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 查看詳情
  const handleViewDetail = (record: QuestionRecord) => {
    setSelectedRecord(record);
    setDetailModalVisible(true);
  };

  // 重置搜索條件
  const handleReset = () => {
    setKeyword('');
    setSource('');
    setUserId('');
    setDateRange(null);
    setCurrentPage(1);
  };

  // 搜索
  const handleSearch = () => {
    setCurrentPage(1);
    fetchQuestionList();
  };

  // 表格列定義
  const columns: ColumnsType<QuestionRecord> = [
    {
      title: '創建時間',
      dataIndex: 'create_date',
      key: 'create_date',
      width: 180,
      render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '用戶',
      key: 'user',
      width: 150,
      render: (_, record) => (
        <div>
          <div>{record.nickname || '未知用戶'}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            {record.email || record.user_id}
          </div>
        </div>
      ),
    },
    {
      title: '問題內容',
      dataIndex: 'question',
      key: 'question',
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          <div style={{ maxWidth: '300px' }}>
            {text.length > 50 ? text.substring(0, 50) + '...' : text}
          </div>
        </Tooltip>
      ),
    },
    {
      title: '來源',
      dataIndex: 'source',
      key: 'source',
      width: 100,
      render: (source: string) => {
        const sourceMap: Record<string, string> = {
          dialog: '對話',
          agent: '智能體',
          api: 'API',
        };
        return sourceMap[source] || source;
      },
    },
    {
      title: 'IP地址',
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 120,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => handleViewDetail(record)}
        >
          詳情
        </Button>
      ),
    },
  ];

  // 行選擇配置
  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys as string[]);
    },
  };

  useEffect(() => {
    fetchQuestionList();
    fetchStats();
  }, [currentPage, pageSize]);

  return (
    <div style={{ padding: '20px' }}>
      <h2>提問記錄管理</h2>

      {/* 統計卡片 */}
      <Row gutter={16} style={{ marginBottom: '20px' }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="總問題數"
              value={stats.total_questions}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="對話來源"
              value={
                stats.source_stats.find((s) => s.source === 'dialog')?.count ||
                0
              }
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="API來源"
              value={
                stats.source_stats.find((s) => s.source === 'api')?.count || 0
              }
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="智能體來源"
              value={
                stats.source_stats.find((s) => s.source === 'agent')?.count || 0
              }
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 搜索區域 */}
      <Card style={{ marginBottom: '20px' }}>
        <Space wrap style={{ marginBottom: '16px' }}>
          <Input
            placeholder="搜索問題內容"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 200 }}
            prefix={<SearchOutlined />}
          />
          <Select
            placeholder="選擇來源"
            value={source}
            onChange={setSource}
            style={{ width: 120 }}
            allowClear
          >
            <Option value="dialog">對話</Option>
            <Option value="agent">智能體</Option>
            <Option value="api">API</Option>
          </Select>
          <Input
            placeholder="用戶ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            style={{ width: 150 }}
          />
          <RangePicker
            value={dateRange}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setDateRange([dates[0], dates[1]]);
              } else {
                setDateRange(null);
              }
            }}
            format="YYYY-MM-DD"
          />
          <Button type="primary" onClick={handleSearch}>
            搜索
          </Button>
          <Button onClick={handleReset}>重置</Button>
        </Space>

        <Space>
          <Button
            type="primary"
            icon={<ExportOutlined />}
            onClick={handleExport}
          >
            導出數據
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={handleDelete}
            disabled={selectedRowKeys.length === 0}
          >
            批量刪除
          </Button>
        </Space>
      </Card>

      {/* 數據表格 */}
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        rowSelection={rowSelection}
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) =>
            `第 ${range[0]}-${range[1]} 條，共 ${total} 條`,
          onChange: (page, size) => {
            setCurrentPage(page);
            setPageSize(size || 20);
          },
        }}
      />

      {/* 詳情模態框 */}
      <Modal
        title="問題詳情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={600}
      >
        {selectedRecord && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <strong>創建時間：</strong>
              {dayjs(selectedRecord.create_date).format('YYYY-MM-DD HH:mm:ss')}
            </div>
            <div style={{ marginBottom: '16px' }}>
              <strong>用戶：</strong>
              {selectedRecord.nickname ||
                selectedRecord.email ||
                selectedRecord.user_id}
            </div>
            <div style={{ marginBottom: '16px' }}>
              <strong>來源：</strong>
              {selectedRecord.source === 'dialog'
                ? '對話'
                : selectedRecord.source === 'agent'
                  ? '智能體'
                  : selectedRecord.source === 'api'
                    ? 'API'
                    : selectedRecord.source}
            </div>
            <div style={{ marginBottom: '16px' }}>
              <strong>IP地址：</strong>
              {selectedRecord.ip_address || '未知'}
            </div>
            <div style={{ marginBottom: '16px' }}>
              <strong>問題內容：</strong>
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '4px',
                  marginTop: '8px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {selectedRecord.question}
              </div>
            </div>
            {selectedRecord.dialog_id && (
              <div style={{ marginBottom: '16px' }}>
                <strong>對話ID：</strong>
                {selectedRecord.dialog_id}
              </div>
            )}
            {selectedRecord.conversation_id && (
              <div style={{ marginBottom: '16px' }}>
                <strong>會話ID：</strong>
                {selectedRecord.conversation_id}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default QuestionRecordManagement;
