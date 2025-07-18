import { ReactComponent as ChatAppCube } from '@/assets/svg/chat-app-cube.svg';
import RenameModal from '@/components/rename-modal';
import { useFetchKnowledgeList } from '@/hooks/knowledge-hooks';
import KnowledgeFile from '@/pages/add-knowledge/components/knowledge-file-chat';
import {
  DeleteOutlined,
  EditOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Divider,
  Dropdown,
  Flex,
  MenuProps,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { MenuItemProps } from 'antd/lib/menu/MenuItem';
import classNames from 'classnames';
import { Resizable } from 're-resizable';
import React, { useCallback, useState } from 'react';
import ChatConfigurationModal from './chat-configuration-modal';
import ChatContainer from './chat-container';
import {
  useDeleteConversation,
  useDeleteDialog,
  useEditDialog,
  useHandleItemHover,
  useRenameConversation,
  useSelectDerivedConversationList,
} from './hooks';

import EmbedModal from '@/components/api-service/embed-modal';
import { useShowEmbedModal } from '@/components/api-service/hooks';
import SvgIcon from '@/components/svg-icon';
import { useTheme } from '@/components/theme-provider';
import { SharedFrom } from '@/constants/chat';
import {
  useClickConversationCard,
  useClickDialogCard,
  useFetchNextDialogList,
  useGetChatSearchParams,
} from '@/hooks/chat-hooks';
import { useTranslate } from '@/hooks/common-hooks';
import { useSetSelectedRecord } from '@/hooks/logic-hooks';
import { IDialog } from '@/interfaces/database/chat';
import { PictureInPicture2 } from 'lucide-react';
import styles from './index.less';

const { Text } = Typography;

const Chat = () => {
  const { list: knowledgeList, loading: knowledgeLoading } =
    useFetchKnowledgeList();
  const { data: dialogList, loading: dialogLoading } = useFetchNextDialogList();

  // 在组件初始化时自动选择第一个dataset和dialog
  React.useEffect(() => {
    if (knowledgeLoading || dialogLoading) {
      return;
    }

    if (knowledgeList?.length > 0 && dialogList?.length > 0) {
      const firstDataset = knowledgeList[0];
      const firstDialog = dialogList[0];

      // 通过URL参数设置选中的dataset和dialog
      const searchParams = new URLSearchParams(window.location.search);
      let needsReload = false;

      if (!searchParams.get('id')) {
        searchParams.set('id', firstDataset.id);
        needsReload = true;
      }

      if (!searchParams.get('dialogId')) {
        searchParams.set('dialogId', firstDialog.id);
        needsReload = true;
      }

      if (needsReload) {
        window.history.replaceState(null, '', `?${searchParams.toString()}`);
        // 强制重新加载对话列表
        window.location.reload();
      }
    }
  }, [knowledgeList, dialogList, knowledgeLoading, dialogLoading]);
  const { onRemoveDialog } = useDeleteDialog();
  const { onRemoveConversation } = useDeleteConversation();
  const { handleClickDialog } = useClickDialogCard();
  const { handleClickConversation } = useClickConversationCard();
  const { dialogId, conversationId } = useGetChatSearchParams();
  const { theme } = useTheme();
  const {
    list: conversationList,
    addTemporaryConversation,
    loading: conversationLoading,
  } = useSelectDerivedConversationList();
  const { activated, handleItemEnter, handleItemLeave } = useHandleItemHover();
  const {
    activated: conversationActivated,
    handleItemEnter: handleConversationItemEnter,
    handleItemLeave: handleConversationItemLeave,
  } = useHandleItemHover();
  const {
    conversationRenameLoading,
    initialConversationName,
    onConversationRenameOk,
    conversationRenameVisible,
    hideConversationRenameModal,
    showConversationRenameModal,
  } = useRenameConversation();
  const {
    dialogSettingLoading,
    initialDialog,
    onDialogEditOk,
    dialogEditVisible,
    clearDialog,
    hideDialogEditModal,
    showDialogEditModal,
  } = useEditDialog();
  const { t } = useTranslate('chat');
  const { currentRecord, setRecord } = useSetSelectedRecord<IDialog>();
  const [controller, setController] = useState(new AbortController());
  const { showEmbedModal, hideEmbedModal, embedVisible, beta } =
    useShowEmbedModal();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const handleAppCardEnter = (id: string) => () => {
    handleItemEnter(id);
  };

  const handleConversationCardEnter = (id: string) => () => {
    handleConversationItemEnter(id);
  };

  const handleShowChatConfigurationModal =
    (dialogId?: string): any =>
    (info: any) => {
      info?.domEvent?.preventDefault();
      info?.domEvent?.stopPropagation();
      showDialogEditModal(dialogId);
    };

  const handleRemoveDialog =
    (dialogId: string): MenuItemProps['onClick'] =>
    ({ domEvent }) => {
      domEvent.preventDefault();
      domEvent.stopPropagation();
      onRemoveDialog([dialogId]);
    };

  const handleShowOverviewModal =
    (dialog: IDialog): any =>
    (info: any) => {
      info?.domEvent?.preventDefault();
      info?.domEvent?.stopPropagation();
      setRecord(dialog);
      showEmbedModal();
    };

  const handleRemoveConversation =
    (conversationId: string): MenuItemProps['onClick'] =>
    ({ domEvent }) => {
      domEvent.preventDefault();
      domEvent.stopPropagation();
      onRemoveConversation([conversationId]);
    };

  const handleShowConversationRenameModal =
    (conversationId: string): MenuItemProps['onClick'] =>
    ({ domEvent }) => {
      domEvent.preventDefault();
      domEvent.stopPropagation();
      showConversationRenameModal(conversationId);
    };

  const handleDialogCardClick = useCallback(
    (dialogId: string) => () => {
      handleClickDialog(dialogId);
    },
    [handleClickDialog],
  );

  const handleConversationCardClick = useCallback(
    (conversationId: string, isNew: boolean) => () => {
      handleClickConversation(conversationId, isNew ? 'true' : '');
      setController((pre) => {
        pre.abort();
        return new AbortController();
      });
    },
    [handleClickConversation],
  );

  const handleCreateTemporaryConversation = useCallback(() => {
    addTemporaryConversation();
  }, [addTemporaryConversation]);

  const buildAppItems = (dialog: IDialog) => {
    const dialogId = dialog.id;

    const appItems: MenuProps['items'] = [
      {
        key: '1',
        onClick: handleShowChatConfigurationModal(dialogId),
        label: (
          <Space>
            <EditOutlined />
            {t('edit', { keyPrefix: 'common' })}
          </Space>
        ),
      },
      { type: 'divider' },
      {
        key: '2',
        onClick: handleRemoveDialog(dialogId),
        label: (
          <Space>
            <DeleteOutlined />
            {t('delete', { keyPrefix: 'common' })}
          </Space>
        ),
      },
      { type: 'divider' },
      {
        key: '3',
        onClick: handleShowOverviewModal(dialog),
        label: (
          <Space>
            {/* <KeyOutlined /> */}
            <PictureInPicture2 className="size-4" />
            {t('embedIntoSite', { keyPrefix: 'common' })}
          </Space>
        ),
      },
    ];

    return appItems;
  };

  const buildConversationItems = (conversationId: string) => {
    const appItems: MenuProps['items'] = [
      {
        key: '1',
        onClick: handleShowConversationRenameModal(conversationId),
        label: (
          <Space>
            <EditOutlined />
            {t('rename', { keyPrefix: 'common' })}
          </Space>
        ),
      },
      { type: 'divider' },
      {
        key: '2',
        onClick: handleRemoveConversation(conversationId),
        label: (
          <Space>
            <DeleteOutlined />
            {t('delete', { keyPrefix: 'common' })}
          </Space>
        ),
      },
    ];

    return appItems;
  };

  return (
    <Flex className={styles.chatWrapper}>
      <Resizable
        defaultSize={{
          width: '25%',
          height: '100%',
        }}
        minWidth="400px"
        maxWidth="500px"
        enable={{
          top: false,
          right: true,
          bottom: false,
          left: false,
          topRight: false,
          bottomRight: false,
          bottomLeft: false,
          topLeft: false,
        }}
        className={styles.pdfPreviewerWrapper}
      >
        <Flex
          vertical
          style={{ height: '100%', overflow: 'auto', width: '100%' }}
        >
          <KnowledgeFile />
        </Flex>
      </Resizable>
      <Flex className={styles.chatContentWrapper}>
        <ChatContainer controller={controller}></ChatContainer>
        <Divider type={'vertical'} className={styles.divider}></Divider>
        <Flex
          className={styles.chatTitleWrapper}
          style={{
            width: sidebarCollapsed ? '0px' : '300px',
            transition: 'width 0.3s',
            position: 'relative',
          }}
        >
          <Button
            type="text"
            icon={sidebarCollapsed ? <RightOutlined /> : <LeftOutlined />}
            onClick={toggleSidebar}
            style={{
              position: 'absolute',
              left: '-25px',
              top: '50%',
              zIndex: 1000,
              transform: 'translateY(-50%)',
              background: theme === 'dark' ? '#1f1f1f' : '#fff',
              border: '1px solid #e8e8e8',
              borderRadius: '4px',
              width: '16px',
              height: '48px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 0,
              fontSize: '12px',
            }}
          />
          {!sidebarCollapsed && (
            <Flex flex={1} vertical>
              <Flex
                justify={'space-between'}
                align="center"
                className={styles.chatTitle}
              >
                <Space>
                  <b>{t('chat')}</b>
                  <Tag>{conversationList.length}</Tag>
                </Space>
                <Tooltip title={t('newChat')}>
                  <div>
                    <SvgIcon
                      name="plus-circle-fill"
                      width={20}
                      onClick={handleCreateTemporaryConversation}
                    ></SvgIcon>
                  </div>
                </Tooltip>
              </Flex>
              <Divider></Divider>
              <Flex vertical gap={10} className={styles.chatTitleContent}>
                <Spin
                  spinning={conversationLoading}
                  wrapperClassName={styles.chatSpin}
                >
                  {conversationList.map((x) => (
                    <Card
                      key={x.id}
                      hoverable
                      onClick={handleConversationCardClick(x.id, x.is_new)}
                      onMouseEnter={handleConversationCardEnter(x.id)}
                      onMouseLeave={handleConversationItemLeave}
                      className={classNames(styles.chatTitleCard, {
                        [theme === 'dark'
                          ? styles.chatTitleCardSelectedDark
                          : styles.chatTitleCardSelected]:
                          x.id === conversationId,
                      })}
                    >
                      <Flex justify="space-between" align="center">
                        <div>
                          <Text
                            ellipsis={{ tooltip: x.name }}
                            style={{ width: 150 }}
                          >
                            {x.name}
                          </Text>
                        </div>
                        {conversationActivated === x.id &&
                          x.id !== '' &&
                          !x.is_new && (
                            <section>
                              <Dropdown
                                menu={{ items: buildConversationItems(x.id) }}
                              >
                                <ChatAppCube
                                  className={styles.cubeIcon}
                                ></ChatAppCube>
                              </Dropdown>
                            </section>
                          )}
                      </Flex>
                    </Card>
                  ))}
                </Spin>
              </Flex>
            </Flex>
          )}
        </Flex>
      </Flex>
      {dialogEditVisible && (
        <ChatConfigurationModal
          visible={dialogEditVisible}
          initialDialog={initialDialog}
          showModal={showDialogEditModal}
          hideModal={hideDialogEditModal}
          loading={dialogSettingLoading}
          onOk={onDialogEditOk}
          clearDialog={clearDialog}
        ></ChatConfigurationModal>
      )}
      <RenameModal
        visible={conversationRenameVisible}
        hideModal={hideConversationRenameModal}
        onOk={onConversationRenameOk}
        initialName={initialConversationName}
        loading={conversationRenameLoading}
      ></RenameModal>

      {embedVisible && (
        <EmbedModal
          visible={embedVisible}
          hideModal={hideEmbedModal}
          token={currentRecord.id}
          form={SharedFrom.Chat}
          beta={beta}
          isAgent={false}
        ></EmbedModal>
      )}
    </Flex>
  );
};

export default Chat;
