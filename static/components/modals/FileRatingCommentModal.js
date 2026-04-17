/**
 * FileRatingCommentModal Component
 *
 * Modal for setting rating (0–5) and comment on a file.
 * Only rendered for clients with the fileRatingComment capability (aMule shared files).
 */

import React from 'https://esm.sh/react@18.2.0';
import Portal from '../common/Portal.js';
import { Button } from '../common/index.js';

const { createElement: h, useState, useEffect, useRef } = React;

const RATING_LABELS = {
  0: 'Not rated',
  1: 'Fake',
  2: 'Poor',
  3: 'Fair',
  4: 'Good',
  5: 'Excellent'
};

const Stars = ({ value, hover, onSelect, onHover }) => {
  const displayed = hover ?? value;
  return h('div', {
    className: 'flex items-center gap-1',
    onMouseLeave: () => onHover(null)
  },
    [1, 2, 3, 4, 5].map((n) =>
      h('button', {
        key: n,
        type: 'button',
        onClick: () => onSelect(n),
        onMouseEnter: () => onHover(n),
        className: 'text-2xl leading-none focus:outline-none transition-colors',
        title: RATING_LABELS[n]
      },
        h('span', {
          className: n <= displayed ? 'text-yellow-500' : 'text-gray-300 dark:text-gray-600'
        }, n <= displayed ? '★' : '☆')
      )
    ),
    h('span', { className: 'ml-2 text-xs text-gray-500 dark:text-gray-400' },
      RATING_LABELS[displayed] || RATING_LABELS[0]
    ),
    value > 0 && h('button', {
      type: 'button',
      onClick: () => onSelect(0),
      onMouseEnter: () => onHover(null),
      title: 'Clear rating',
      className: 'ml-2 text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 underline decoration-dotted focus:outline-none'
    }, 'Clear')
  );
};

const FileRatingCommentModal = ({
  show,
  fileHash,
  fileName,
  instanceId,
  initialRating = 0,
  initialComment = '',
  onSubmit,
  onClose
}) => {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(null);
  const [comment, setComment] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (show) {
      setRating(Number.isInteger(initialRating) ? initialRating : 0);
      setComment(initialComment || '');
      setHoverRating(null);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [show, initialRating, initialComment]);

  if (!show) return null;

  const isDirty = rating !== (initialRating || 0) || comment !== (initialComment || '');
  // A comment without a star rating doesn't make sense (aMule always writes
  // both fields together; peers need the rating to contextualize the comment).
  const commentWithoutRating = comment.trim().length > 0 && rating === 0;
  const canSave = isDirty && !commentWithoutRating;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSave) return;
    onSubmit(fileHash, comment, rating, instanceId);
    onClose();
  };

  const handleClear = () => {
    setRating(0);
    setComment('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
  };

  return h(Portal, null,
    h('div', {
      className: 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4',
      onClick: (e) => { if (e.target === e.currentTarget) onClose(); },
      onKeyDown: handleKeyDown
    },
      h('div', {
        className: 'bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg'
      },
        h('div', { className: 'px-4 py-3 border-b border-gray-200 dark:border-gray-700' },
          h('h3', { className: 'text-base font-semibold text-gray-900 dark:text-gray-100' }, 'Set Rating & Comment'),
          fileName && h('p', {
            className: 'text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate',
            title: fileName
          }, fileName)
        ),

        h('form', { onSubmit: handleSubmit, className: 'px-4 py-4 space-y-4' },
          h('div', null,
            h('label', { className: 'block text-sm text-gray-600 dark:text-gray-400 mb-2' }, 'Rating'),
            h(Stars, {
              value: rating,
              hover: hoverRating,
              onSelect: setRating,
              onHover: setHoverRating
            })
          ),

          h('div', null,
            h('label', { className: 'block text-sm text-gray-600 dark:text-gray-400 mb-1' }, 'Comment'),
            h('textarea', {
              ref: textareaRef,
              value: comment,
              onChange: (e) => setComment(e.target.value),
              rows: 4,
              maxLength: 500,
              className: 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none',
              placeholder: 'Optional comment shared with peers'
            }),
            h('div', { className: 'flex justify-between items-center mt-1' },
              commentWithoutRating
                ? h('p', { className: 'text-xs text-amber-600 dark:text-amber-400' }, 'Set a rating to save a comment')
                : h('span', null),
              h('p', { className: 'text-xs text-gray-400 dark:text-gray-500' }, `${comment.length}/500`)
            )
          ),

          h('div', { className: 'flex justify-between gap-2 pt-2' },
            h(Button, {
              variant: 'secondary',
              type: 'button',
              onClick: handleClear,
              disabled: rating === 0 && comment === ''
            }, 'Clear'),
            h('div', { className: 'flex gap-2' },
              h(Button, { variant: 'secondary', onClick: onClose, type: 'button' }, 'Cancel'),
              h(Button, { variant: 'primary', type: 'submit', disabled: !canSave }, 'Save')
            )
          )
        )
      )
    )
  );
};

export default FileRatingCommentModal;
