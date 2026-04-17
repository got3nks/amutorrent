/**
 * useFileRatingCommentModal Hook
 *
 * Manages FileRatingCommentModal state and returns ready-to-render modal element.
 * Mirrors useFileRenameModal.
 */

import React, { useState, useCallback, useMemo } from 'https://esm.sh/react@18.2.0';
import FileRatingCommentModal from '../components/modals/FileRatingCommentModal.js';
import { useActions } from '../contexts/ActionsContext.js';

const { createElement: h } = React;

export const useFileRatingCommentModal = () => {
  const [item, setItem] = useState(null);
  const { files } = useActions();

  const openRatingCommentModal = useCallback((target) => {
    setItem(target);
  }, []);

  const closeRatingCommentModal = useCallback(() => {
    setItem(null);
  }, []);

  const FileRatingCommentElement = useMemo(() => {
    return h(FileRatingCommentModal, {
      show: !!item,
      fileHash: item?.hash || null,
      fileName: item?.name || '',
      instanceId: item?.instanceId || null,
      initialRating: item?.rating || 0,
      initialComment: item?.comment || '',
      onSubmit: files.setFileRatingComment,
      onClose: closeRatingCommentModal
    });
  }, [item, files.setFileRatingComment, closeRatingCommentModal]);

  return {
    openRatingCommentModal,
    FileRatingCommentElement
  };
};

export default useFileRatingCommentModal;
