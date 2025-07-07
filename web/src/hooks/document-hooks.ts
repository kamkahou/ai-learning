import { useFetchUserInfo } from '@/hooks/user-hooks';
import { IReferenceChunk } from '@/interfaces/database/chat';
import { IDocumentInfo } from '@/interfaces/database/document';
import { IChunk } from '@/interfaces/database/knowledge';
import {
  IChangeParserConfigRequestBody,
  IDocumentMetaRequestBody,
} from '@/interfaces/request/document';
import i18n from '@/locales/config';
import chatService from '@/services/chat-service';
import kbService from '@/services/knowledge-service';
import api, { api_host } from '@/utils/api';
import { buildChunkHighlights } from '@/utils/document-util';
import { post } from '@/utils/request';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UploadFile, message } from 'antd';
import { get } from 'lodash';
import { useCallback, useMemo, useState } from 'react';
import { IHighlight } from 'react-pdf-highlighter';
import { useParams } from 'umi';
import {
  useGetPaginationWithRouter,
  useHandleSearchChange,
} from './logic-hooks';
import {
  useGetKnowledgeSearchParams,
  useSetPaginationParams,
} from './route-hook';

export const useGetDocumentUrl = (documentId?: string) => {
  const getDocumentUrl = useCallback(
    (id?: string) => {
      return `${api_host}/document/get/${documentId || id}`;
    },
    [documentId],
  );

  return getDocumentUrl;
};

export const useGetChunkHighlights = (
  selectedChunk: IChunk | IReferenceChunk,
) => {
  const [size, setSize] = useState({ width: 849, height: 1200 });

  const highlights: IHighlight[] = useMemo(() => {
    return buildChunkHighlights(selectedChunk, size);
  }, [selectedChunk, size]);

  const setWidthAndHeight = (width: number, height: number) => {
    setSize((pre) => {
      if (pre.height !== height || pre.width !== width) {
        return { height, width };
      }
      return pre;
    });
  };

  return { highlights, setWidthAndHeight };
};

export const useFetchNextDocumentList = () => {
  const { knowledgeId: knowledgeIdFromUrl } = useGetKnowledgeSearchParams();
  const { searchString, handleInputChange } = useHandleSearchChange();
  const { pagination, setPagination } = useGetPaginationWithRouter();
  const { id: idFromParams } = useParams();
  const { userInfo, role } = useFetchUserInfo();

  const { data, isFetching: loading } = useQuery<{
    docs: IDocumentInfo[];
    total: number;
    kb_id: string;
  }>({
    queryKey: ['fetchDocumentList', userInfo?.id, searchString, pagination],
    initialData: { docs: [], total: 0, kb_id: '' },
    enabled: !!userInfo,
    queryFn: async () => {
      let kb_id = knowledgeIdFromUrl || idFromParams;

      // 如果没有从URL获取到knowledge base ID，自动获取第一个可用的知识库
      if (!kb_id) {
        const { data: kbData } = await kbService.getList();
        if (kbData.data?.kbs?.length > 0) {
          kb_id = kbData.data.kbs[0].id;
        } else {
          return { docs: [], total: 0, kb_id: '' };
        }
      }

      if (!kb_id) {
        return { docs: [], total: 0, kb_id: '' };
      }

      const { data: docData } = await kbService.get_document_list({
        kb_id: kb_id,
        keywords: searchString,
        page_size: pagination.pageSize,
        page: pagination.current,
      });

      if (docData.code === 0) {
        return {
          docs: docData.data.docs,
          total: docData.data.total,
          kb_id: kb_id,
        };
      }
      return { docs: [], total: 0, kb_id: kb_id || '' };
    },
  });

  const onInputChange: React.ChangeEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      setPagination({ page: 1 });
      handleInputChange(e);
    },
    [handleInputChange, setPagination],
  );

  return {
    loading,
    searchString,
    documents: data?.docs || [],
    knowledgeId: data?.kb_id || '',
    pagination: { ...pagination, total: data?.total || 0 },
    handleInputChange: onInputChange,
    setPagination,
  };
};

export const useSetNextDocumentStatus = () => {
  const queryClient = useQueryClient();

  const {
    data,
    isPending: loading,
    mutateAsync,
  } = useMutation({
    mutationKey: ['updateDocumentStatus'],
    mutationFn: async ({
      status,
      documentId,
    }: {
      status: boolean;
      documentId: string;
    }) => {
      const { data } = await kbService.document_change_status({
        doc_id: documentId,
        status: Number(status),
      });
      if (data.code === 0) {
        message.success(i18n.t('message.modified'));
        queryClient.invalidateQueries({ queryKey: ['fetchDocumentList'] });
      }
      return data;
    },
  });

  return { setDocumentStatus: mutateAsync, data, loading };
};

export const useSaveNextDocumentName = () => {
  const queryClient = useQueryClient();

  const {
    data,
    isPending: loading,
    mutateAsync,
  } = useMutation({
    mutationKey: ['saveDocumentName'],
    mutationFn: async ({
      name,
      documentId,
    }: {
      name: string;
      documentId: string;
    }) => {
      const { data } = await kbService.document_rename({
        doc_id: documentId,
        name: name,
      });
      if (data.code === 0) {
        message.success(i18n.t('message.renamed'));
        queryClient.invalidateQueries({ queryKey: ['fetchDocumentList'] });
      }
      return data.code;
    },
  });

  return { loading, saveName: mutateAsync, data };
};

export const useCreateNextDocument = () => {
  const { knowledgeId } = useGetKnowledgeSearchParams();
  const { setPaginationParams, page } = useSetPaginationParams();
  const queryClient = useQueryClient();

  const {
    data,
    isPending: loading,
    mutateAsync,
  } = useMutation({
    mutationKey: ['createDocument'],
    mutationFn: async (name: string) => {
      const { data } = await kbService.document_create({
        name,
        kb_id: knowledgeId,
      });
      if (data.code === 0) {
        if (page === 1) {
          queryClient.invalidateQueries({ queryKey: ['fetchDocumentList'] });
        } else {
          setPaginationParams(); // fetch document list
        }

        message.success(i18n.t('message.created'));
      }
      return data.code;
    },
  });

  return { createDocument: mutateAsync, loading, data };
};

export const useSetNextDocumentParser = () => {
  const queryClient = useQueryClient();

  const {
    data,
    isPending: loading,
    mutateAsync,
  } = useMutation({
    mutationKey: ['setDocumentParser'],
    mutationFn: async ({
      parserId,
      documentId,
      parserConfig,
    }: {
      parserId: string;
      documentId: string;
      parserConfig: IChangeParserConfigRequestBody;
    }) => {
      const { data } = await kbService.document_change_parser({
        parser_id: parserId,
        doc_id: documentId,
        parser_config: parserConfig,
      });
      if (data.code === 0) {
        queryClient.invalidateQueries({ queryKey: ['fetchDocumentList'] });

        message.success(i18n.t('message.modified'));
      }
      return data.code;
    },
  });

  return { setDocumentParser: mutateAsync, data, loading };
};

export const useUploadNextDocument = () => {
  const queryClient = useQueryClient();
  const { knowledgeId } = useGetKnowledgeSearchParams();
  const { userInfo, role } = useFetchUserInfo();

  const {
    data,
    isPending: loading,
    mutateAsync,
  } = useMutation({
    mutationKey: ['uploadDocument'],
    mutationFn: async ({
      fileList,
      visibility = 'private',
    }: {
      fileList: UploadFile[];
      visibility?: 'public' | 'private';
    }) => {
      let finalKbId = knowledgeId;

      if (role !== 'admin') {
        const { data: kbData } = await kbService.getList();
        if (kbData.data?.kbs?.length > 0) {
          finalKbId = kbData.data.kbs[0].id;
        } else {
          message.error('No default knowledge base found for upload.');
          return;
        }
      }

      if (!finalKbId) {
        message.error('No knowledge base selected for upload.');
        return;
      }

      const formData = new FormData();
      formData.append('kb_id', finalKbId);
      formData.append('visibility', visibility);
      if (fileList && Array.isArray(fileList)) {
        fileList.forEach((file: any) => {
          formData.append('file', file);
        });
      }

      try {
        console.log('Debug - Upload FormData:', {
          kb_id: knowledgeId,
          visibility: visibility,
          fileCount: fileList.length,
        });

        const ret = await kbService.document_upload(formData);
        const code = get(ret, 'data.code');

        if (code === 0 || code === 500) {
          queryClient.invalidateQueries({ queryKey: ['fetchDocumentList'] });
        }
        return ret?.data;
      } catch (error) {
        console.warn(error);
        return {
          code: 500,
          message: error + '',
        };
      }
    },
  });

  return {
    uploadDocument: ({
      fileList,
      visibility,
    }: {
      fileList: UploadFile[];
      visibility?: 'public' | 'private';
    }) => mutateAsync({ fileList, visibility }),
    loading,
    data,
  };
};

export const useNextWebCrawl = () => {
  const { knowledgeId } = useGetKnowledgeSearchParams();

  const {
    data,
    isPending: loading,
    mutateAsync,
  } = useMutation({
    mutationKey: ['webCrawl'],
    mutationFn: async ({ name, url }: { name: string; url: string }) => {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('url', url);
      formData.append('kb_id', knowledgeId);

      const ret = await kbService.web_crawl(formData);
      const code = get(ret, 'data.code');
      if (code === 0) {
        message.success(i18n.t('message.uploaded'));
      }

      return code;
    },
  });

  return {
    data,
    loading,
    webCrawl: mutateAsync,
  };
};

export const useRunNextDocument = () => {
  const queryClient = useQueryClient();

  const {
    data,
    isPending: loading,
    mutateAsync,
  } = useMutation({
    mutationKey: ['runDocumentByIds'],
    mutationFn: async ({
      documentIds,
      run,
      shouldDelete,
    }: {
      documentIds: string[];
      run: number;
      shouldDelete: boolean;
    }) => {
      const ret = await kbService.document_run({
        doc_ids: documentIds,
        run,
        delete: shouldDelete,
      });
      const code = get(ret, 'data.code');
      if (code === 0) {
        queryClient.invalidateQueries({ queryKey: ['fetchDocumentList'] });
        message.success(i18n.t('message.operated'));
      }

      return code;
    },
  });

  return { runDocumentByIds: mutateAsync, loading, data };
};

export const useFetchDocumentInfosByIds = () => {
  const [ids, setDocumentIds] = useState<string[]>([]);

  const idList = useMemo(() => {
    return ids.filter((x) => typeof x === 'string' && x !== '');
  }, [ids]);

  const { data } = useQuery<IDocumentInfo[]>({
    queryKey: ['fetchDocumentInfos', idList],
    enabled: idList.length > 0,
    initialData: [],
    queryFn: async () => {
      const { data } = await kbService.document_infos({ doc_ids: idList });
      if (data.code === 0) {
        return data.data;
      }

      return [];
    },
  });

  return { data, setDocumentIds };
};

export const useFetchDocumentThumbnailsByIds = () => {
  const [ids, setDocumentIds] = useState<string[]>([]);
  const { data } = useQuery<Record<string, string>>({
    queryKey: ['fetchDocumentThumbnails', ids],
    enabled: ids.length > 0,
    initialData: {},
    queryFn: async () => {
      const { data } = await kbService.document_thumbnails({ doc_ids: ids });
      if (data.code === 0) {
        return data.data;
      }
      return {};
    },
  });

  return { data, setDocumentIds };
};

export const useRemoveNextDocument = () => {
  const queryClient = useQueryClient();
  const {
    data,
    isPending: loading,
    mutateAsync,
  } = useMutation({
    mutationKey: ['removeDocument'],
    mutationFn: async (documentIds: string | string[]) => {
      const { data } = await kbService.document_rm({ doc_id: documentIds });
      if (data.code === 0) {
        message.success(i18n.t('message.deleted'));
        queryClient.invalidateQueries({ queryKey: ['fetchDocumentList'] });
      }
      return data.code;
    },
  });

  return { data, loading, removeDocument: mutateAsync };
};

export const useDeleteDocument = () => {
  const {
    data,
    isPending: loading,
    mutateAsync,
  } = useMutation({
    mutationKey: ['deleteDocument'],
    mutationFn: async (documentIds: string[]) => {
      const data = await kbService.document_delete({ doc_ids: documentIds });

      return data;
    },
  });

  return { data, loading, deleteDocument: mutateAsync };
};

export const useUploadAndParseDocument = (uploadMethod: string) => {
  const {
    data,
    isPending: loading,
    mutateAsync,
  } = useMutation({
    mutationKey: ['uploadAndParseDocument'],
    mutationFn: async ({
      conversationId,
      fileList,
    }: {
      conversationId: string;
      fileList: UploadFile[];
    }) => {
      try {
        const formData = new FormData();
        formData.append('conversation_id', conversationId);
        fileList.forEach((file: UploadFile) => {
          formData.append('file', file as any);
        });
        if (uploadMethod === 'upload_and_parse') {
          const data = await kbService.upload_and_parse(formData);
          return data?.data;
        }
        const data = await chatService.uploadAndParseExternal(formData);
        return data?.data;
      } catch (error) {}
    },
  });

  return { data, loading, uploadAndParseDocument: mutateAsync };
};

export const useParseDocument = () => {
  const {
    data,
    isPending: loading,
    mutateAsync,
  } = useMutation({
    mutationKey: ['parseDocument'],
    mutationFn: async (url: string) => {
      try {
        const data = await post(api.parse, { url });
        if (data?.code === 0) {
          message.success(i18n.t('message.uploaded'));
        }
        return data;
      } catch (error) {
        message.error('error');
      }
    },
  });

  return { parseDocument: mutateAsync, data, loading };
};

export const useSetDocumentMeta = () => {
  const queryClient = useQueryClient();

  const {
    data,
    isPending: loading,
    mutateAsync,
  } = useMutation({
    mutationKey: ['setDocumentMeta'],
    mutationFn: async (params: IDocumentMetaRequestBody) => {
      try {
        const { data } = await kbService.setMeta({
          meta: params.meta,
          doc_id: params.documentId,
        });

        if (data?.code === 0) {
          queryClient.invalidateQueries({ queryKey: ['fetchDocumentList'] });

          message.success(i18n.t('message.modified'));
        }
        return data?.code;
      } catch (error) {
        message.error('error');
      }
    },
  });

  return { setDocumentMeta: mutateAsync, data, loading };
};
