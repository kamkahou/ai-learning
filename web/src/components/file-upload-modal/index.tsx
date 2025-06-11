import { useTranslate } from '@/hooks/common-hooks';
import { IModalProps } from '@/interfaces/common';
import { InboxOutlined } from '@ant-design/icons';
import {
  Checkbox,
  Flex,
  Modal,
  Progress,
  Segmented,
  Tabs,
  TabsProps,
  Upload,
  UploadFile,
  UploadProps,
  Radio,
} from 'antd';
import { Dispatch, SetStateAction, useState } from 'react';
import storage from '@/utils/authorization-util';

import styles from './index.less';

const { Dragger } = Upload;

const FileUpload = ({
  directory,
  fileList,
  setFileList,
  uploadProgress,
}: {
  directory: boolean;
  fileList: UploadFile[];
  setFileList: Dispatch<SetStateAction<UploadFile[]>>;
  uploadProgress?: number;
}) => {
  const { t } = useTranslate('fileManager');
  const props: UploadProps = {
    multiple: true,
    onRemove: (file) => {
      const index = fileList.indexOf(file);
      const newFileList = fileList.slice();
      newFileList.splice(index, 1);
      setFileList(newFileList);
    },
    beforeUpload: (file: UploadFile) => {
      setFileList((pre) => {
        return [...pre, file];
      });

      return false;
    },
    directory,
    fileList,
    progress: {
      strokeWidth: 2,
    },
  };

  return (
    <>
      <Progress percent={uploadProgress} showInfo={false} />
      <Dragger {...props} className={styles.uploader}>
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">{t('uploadTitle')}</p>
        <p className="ant-upload-hint">{t('uploadDescription')}</p>
        {false && <p className={styles.uploadLimit}>{t('uploadLimit')}</p>}
      </Dragger>
    </>
  );
};

interface IFileUploadModalProps
  extends IModalProps<
    { parseOnCreation: boolean; directoryFileList: UploadFile[]; visibility: 'public' | 'private' } | UploadFile[]
  > {
  uploadFileList?: UploadFile[];
  setUploadFileList?: Dispatch<SetStateAction<UploadFile[]>>;
  uploadProgress?: number;
  setUploadProgress?: Dispatch<SetStateAction<number>>;
}

const FileUploadModal = ({
  visible,
  hideModal,
  loading,
  onOk: onFileUploadOk,
  uploadFileList: fileList,
  setUploadFileList: setFileList,
  uploadProgress,
  setUploadProgress,
}: IFileUploadModalProps) => {
  const { t } = useTranslate('fileManager');
  const [value, setValue] = useState<string>('local');
  const [parseOnCreation, setParseOnCreation] = useState(false);
  const [currentFileList, setCurrentFileList] = useState<UploadFile[]>([]);
  const [directoryFileList, setDirectoryFileList] = useState<UploadFile[]>([]);
  const userInfo = storage.getUserInfoObject();
  const isAdmin = userInfo?.is_superuser;
  const [fileVisibility, setFileVisibility] = useState<'public' | 'private'>(isAdmin ? 'private' : 'private');

  const clearFileList = () => {
    if (setFileList) {
      setFileList([]);
      setUploadProgress?.(0);
    } else {
      setCurrentFileList([]);
    }
    setDirectoryFileList([]);
  };

  const onOk = async () => {
    if (uploadProgress === 100) {
      hideModal?.();
      return;
    }

    const ret = await onFileUploadOk?.(
      fileList
        ? { parseOnCreation, directoryFileList, visibility: fileVisibility }
        : currentFileList.concat(directoryFileList),
    );
    return ret;
  };

  const afterClose = () => {
    clearFileList();
  };

  return (
    <Modal
      title={t('uploadFile')}
      open={visible}
      onOk={onOk}
      onCancel={hideModal}
      confirmLoading={loading}
      afterClose={afterClose}
    >
      <Tabs
        activeKey={value}
        onChange={setValue}
        items={[
          {
            key: 'local',
            label: t('local'),
            children: (
              <FileUpload
                directory={false}
                fileList={fileList || currentFileList}
                setFileList={setFileList || setCurrentFileList}
                uploadProgress={uploadProgress}
              />
            ),
          },
          {
            key: 'directory',
            label: t('directory'),
            children: (
              <FileUpload
                directory={true}
                fileList={directoryFileList}
                setFileList={setDirectoryFileList}
                uploadProgress={uploadProgress}
              />
            ),
          },
        ]}
      />
      <div style={{ marginTop: 16 }}>
        <Checkbox
          checked={parseOnCreation}
          onChange={(e) => setParseOnCreation(e.target.checked)}
        >
          {t('parseOnCreation')}
        </Checkbox>
      </div>
      <div style={{ marginTop: 16 }}>
        <Radio.Group
          value={fileVisibility}
          onChange={(e) => setFileVisibility(e.target.value)}
        >
          <Radio value="private">{t('private')}</Radio>
          <Radio value="public" disabled={!isAdmin}>{t('public')}</Radio>
        </Radio.Group>
      </div>
    </Modal>
  );
};

export default FileUploadModal;
