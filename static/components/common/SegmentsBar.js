/**
 * SegmentsBar Component
 *
 * Displays segmented progress bar for ED2K downloads based on aMule's algorithm
 * Shows which parts are available from sources, missing, or being requested
 *
 * IMPLEMENTATION:
 * - Uses RLE (Run-Length Encoding) decoder for EC protocol buffers
 * - Decodes gapStatus (missing byte ranges), partStatus (source counts), reqStatus (requested ranges)
 * - Based on aMule's PartFileEncoderData and WebServer progress bar implementation
 *
 * COLOR SCHEME (matches aMule GUI):
 * - Green (0, 224, 0): Downloaded (complete)
 * - Gold (255, 208, 0): Currently being requested from sources
 * - Blue gradient (0, N, 255): Missing with sources — intensity scales with source count
 * - Red (255, 0, 0): Missing with no sources
 */

import React from 'https://esm.sh/react@18.2.0';

const { createElement: h } = React;

// ED2K standard part size: 9.5 MB (9728000 bytes)
const PARTSIZE = 9728000;

// Enable debug logging
const DEBUG = false;

/**
 * RLE (Run-Length Encoding) Decoder
 * Based on aMule's RLE.cpp implementation
 *
 * The EC protocol uses RLE compression with the following algorithm:
 * - Sequences where buff[i+1] == buff[i] are compressed
 * - Format: [value][value][count] where count = number of repetitions
 * - Single values pass through uncompressed
 */

/**
 * Decode RLE-encoded binary data
 * @param {Uint8Array} buff - RLE-encoded buffer
 * @returns {Uint8Array} Decoded buffer
 */
const decodeRLE = (buff) => {
  if (!buff || buff.length === 0) {
    return new Uint8Array(0);
  }

  // First pass: calculate output size
  let outputSize = 0;
  let i = 0;
  while (i < buff.length) {
    if (i + 1 < buff.length && buff[i + 1] === buff[i]) {
      // Sequence found: [value][value][count]
      if (i + 2 < buff.length) {
        const count = buff[i + 2];
        outputSize += count;
        i += 3; // Skip value, value, count
      } else {
        // Incomplete sequence, treat as two single values
        outputSize += 2;
        i += 2;
      }
    } else {
      // Single value
      outputSize += 1;
      i += 1;
    }
  }

  // Second pass: decode data
  const output = new Uint8Array(outputSize);
  let outIdx = 0;
  i = 0;
  while (i < buff.length) {
    if (i + 1 < buff.length && buff[i + 1] === buff[i]) {
      // Sequence found: [value][value][count]
      if (i + 2 < buff.length) {
        const value = buff[i];
        const count = buff[i + 2];
        // Fill with repeated value
        for (let j = 0; j < count; j++) {
          output[outIdx++] = value;
        }
        i += 3;
      } else {
        // Incomplete sequence, treat as two single values
        output[outIdx++] = buff[i];
        output[outIdx++] = buff[i + 1];
        i += 2;
      }
    } else {
      // Single value
      output[outIdx++] = buff[i];
      i += 1;
    }
  }

  return output;
};

/**
 * Decode RLE-encoded data to UInt64 array
 * The data is byte-interleaved in column-major order for compression efficiency
 * @param {Uint8Array} buff - RLE-encoded buffer
 * @returns {BigUint64Array} Decoded uint64 array
 */
const decodeRLEtoUInt64 = (buff) => {
  // First decode the RLE compression
  const decoded = decodeRLE(buff);

  if (decoded.length === 0) {
    return new BigUint64Array(0);
  }

  // Calculate number of uint64 values (8 bytes each, interleaved)
  const size = Math.floor(decoded.length / 8);
  if (size === 0) {
    return new BigUint64Array(0);
  }

  const output = new BigUint64Array(size);

  // Reconstruct uint64 values from byte-interleaved data
  // Bytes are stored as: [byte0_val0, byte0_val1, ..., byte0_valN, byte1_val0, ...]
  // ED2K uses little-endian byte order (LSB first)
  for (let i = 0; i < size; i++) {
    let value = 0n;
    // Read 8 bytes in column-major order, little-endian (LSB first)
    for (let j = 0; j < 8; j++) {
      const byteIdx = i + j * size;
      if (byteIdx < decoded.length) {
        // Little-endian: byte 0 is LSB, byte 7 is MSB
        value = value | (BigInt(decoded[byteIdx]) << BigInt(j * 8));
      }
    }
    output[i] = value;
  }

  if (DEBUG) {
    console.log('[decodeRLEtoUInt64] Decoded size:', size);
    console.log('[decodeRLEtoUInt64] Input bytes:', decoded.length);
    console.log('[decodeRLEtoUInt64] First 5 values:',
      Array.from(output.slice(0, 5)).map(v => v.toString()));
  }

  return output;
};

/**
 * Parse gap status into array of gap ranges.
 * Accepts pre-decoded array from AmuleClient (preferred) or legacy RLE buffer format.
 * @param {Array<{start: number, end: number}>|Buffer|Uint8Array|Object} gapStatus
 * @returns {Array<{start: number, end: number}>} Array of gap byte ranges
 */
const parseGapStatus = (gapStatus) => {
  if (!gapStatus) {
    if (DEBUG) console.log('[SegmentsBar] No gap status data');
    return [];
  }

  // Pre-decoded format from AmuleClient: array of {start, end} objects
  if (Array.isArray(gapStatus)) {
    if (DEBUG) {
      console.log('[SegmentsBar] Pre-decoded gaps:', gapStatus.length);
      if (gapStatus.length > 0) {
        console.log('[SegmentsBar] First 5 gaps:', gapStatus.slice(0, 5).map(g => `${g.start}-${g.end} (${((g.end-g.start)/1024/1024).toFixed(1)}MB)`));
      console.log('[SegmentsBar] Last 3 gaps:', gapStatus.slice(-3).map(g => `${g.start}-${g.end} (${((g.end-g.start)/1024/1024).toFixed(1)}MB)`));
      const totalGapBytes = gapStatus.reduce((s, g) => s + (g.end - g.start), 0);
      console.log('[SegmentsBar] Total gap bytes:', totalGapBytes, `(${(totalGapBytes/1024/1024/1024).toFixed(2)} GB)`);
      }
    }
    return gapStatus;
  }

  // Legacy: RLE-encoded buffer format (serialized as {type: 'Buffer', data: [...]})
  if (gapStatus.type === 'Buffer' && gapStatus.data) {
    gapStatus = new Uint8Array(gapStatus.data);
  } else if (!(gapStatus instanceof Uint8Array)) {
    gapStatus = new Uint8Array(gapStatus);
  }

  if (gapStatus.length === 0) return [];

  if (DEBUG) {
    console.log('[SegmentsBar] Legacy gap buffer length:', gapStatus.length);
  }

  try {
    const decoded = decodeRLEtoUInt64(gapStatus);
    const gaps = [];
    for (let i = 0; i < decoded.length; i += 2) {
      if (i + 1 < decoded.length) {
        gaps.push({ start: Number(decoded[i]), end: Number(decoded[i + 1]) });
      }
    }
    return gaps;
  } catch (error) {
    console.error('[SegmentsBar] Error decoding gap status:', error);
    return [];
  }
};

/**
 * Parse requested parts into array of byte ranges.
 * Accepts pre-decoded array from AmuleClient (preferred) or legacy RLE buffer format.
 * @param {Array<{start: number, end: number}>|Buffer|Uint8Array|Object} reqStatus
 * @returns {Array<{start: number, end: number}>} Array of requested byte ranges
 */
const parseReqStatus = (reqStatus) => {
  if (!reqStatus) {
    if (DEBUG) console.log('[SegmentsBar] No request status data');
    return [];
  }

  // Pre-decoded format from AmuleClient: array of {start, end} objects
  if (Array.isArray(reqStatus)) {
    if (DEBUG) {
      console.log('[SegmentsBar] Pre-decoded requests:', reqStatus.length);
    }
    return reqStatus;
  }

  // Legacy: RLE-encoded buffer format
  if (reqStatus.type === 'Buffer' && reqStatus.data) {
    reqStatus = new Uint8Array(reqStatus.data);
  } else if (!(reqStatus instanceof Uint8Array)) {
    reqStatus = new Uint8Array(reqStatus);
  }

  if (reqStatus.length === 0) return [];

  try {
    const decoded = decodeRLEtoUInt64(reqStatus);
    const requests = [];
    for (let i = 0; i < decoded.length; i += 2) {
      if (i + 1 < decoded.length) {
        requests.push({ start: Number(decoded[i]), end: Number(decoded[i + 1]) });
      }
    }
    return requests;
  } catch (error) {
    console.error('[SegmentsBar] Error decoding request status:', error);
    return [];
  }
};

/**
 * Parse part status into array of source counts per part.
 * Accepts pre-decoded array from AmuleClient (preferred) or legacy RLE buffer format.
 * @param {number[]|Buffer|Uint8Array|Object} partStatus
 * @returns {number[]|Uint8Array} Array of source counts per part
 */
const parsePartStatus = (partStatus) => {
  if (!partStatus) {
    if (DEBUG) console.log('[SegmentsBar] No part status data');
    return [];
  }

  // Pre-decoded format from AmuleClient: plain array of source counts
  if (Array.isArray(partStatus)) {
    if (DEBUG) {
      console.log('[SegmentsBar] Pre-decoded parts:', partStatus.length);
      if (partStatus.length > 0) {
        console.log('[SegmentsBar] First 20 parts:', partStatus.slice(0, 20));
      }
    }
    return partStatus;
  }

  // Legacy: RLE-encoded buffer format
  if (partStatus.type === 'Buffer' && partStatus.data) {
    partStatus = new Uint8Array(partStatus.data);
  } else if (!(partStatus instanceof Uint8Array)) {
    partStatus = new Uint8Array(partStatus);
  }

  if (partStatus.length === 0) return [];

  try {
    const decoded = decodeRLE(partStatus);
    if (DEBUG) {
      console.log('[SegmentsBar] Decoded part status length:', decoded.length);
    }
    return decoded;
  } catch (error) {
    console.error('[SegmentsBar] Error decoding part status:', error);
    return [];
  }
};

/**
 * SegmentsBar Component
 * Renders an SVG-based progress bar showing file download status
 *
 * Uses RLE decoding to parse aMule EC protocol buffers for accurate segment-level visualization
 *
 * @param {Object} props
 * @param {number} props.fileSize - Total file size in bytes
 * @param {Buffer|Uint8Array} props.partStatus - RLE-encoded part status buffer (source count per part)
 * @param {Buffer|Uint8Array} props.gapStatus - RLE-encoded gap status buffer (missing byte ranges)
 * @param {Buffer|Uint8Array} props.reqStatus - RLE-encoded request status buffer (requested byte ranges)
 * @param {number} props.fileSizeDownloaded - Downloaded bytes (unused in current implementation)
 * @param {number} props.sourceCount - Total number of sources (unused, kept for API compatibility)
 * @param {number} props.width - Width of progress bar in pixels (default: 280)
 * @param {number} props.height - Height of progress bar in pixels (default: 16)
 */
const SegmentsBar = ({
  fileSize,
  partStatus,
  gapStatus,
  reqStatus,
  fileSizeDownloaded, // eslint-disable-line no-unused-vars
  sourceCount, // eslint-disable-line no-unused-vars
  width = 280,
  height = 16
}) => {
  if (!fileSize || fileSize === 0) {
    return h('svg', {
      viewBox: `0 0 ${width} ${height}`,
      style: {
        display: 'block',
        width: '100%',
        height: '100%'
      },
      preserveAspectRatio: 'none'
    },
      h('rect', { width, height, fill: '#e5e7eb' })
    );
  }

  // Parse RLE-encoded buffers
  const gaps = parseGapStatus(gapStatus);
  const requests = parseReqStatus(reqStatus);
  const parts = parsePartStatus(partStatus);

  // Calculate total number of parts
  const totalParts = Math.ceil(fileSize / PARTSIZE);

  if (DEBUG) {
    console.log('=== SegmentsBar Debug ===');
    console.log('[SegmentsBar] File size:', fileSize);
    console.log('[SegmentsBar] Downloaded:', fileSizeDownloaded);
    console.log('[SegmentsBar] Total parts:', totalParts);
    console.log('[SegmentsBar] Gaps count:', gaps.length);
    if (gaps.length > 0) {
      console.log('[SegmentsBar] First 3 gaps:', gaps.slice(0, 3).map(g => ({
        start: g.start.toString(),
        end: g.end.toString(),
        size: (g.end - g.start).toString()
      })));
    }
    console.log('[SegmentsBar] Requests count:', requests.length);
    console.log('[SegmentsBar] Parts array length:', parts.length);
    if (parts.length > 0) {
      console.log('[SegmentsBar] First 10 part source counts:', Array.from(parts.slice(0, 10)));
      console.log('[SegmentsBar] Parts with 0 sources:', Array.from(parts).filter(p => p === 0).length);
      console.log('[SegmentsBar] Parts with sources:', Array.from(parts).filter(p => p > 0).length);
    }
  }

  /**
   * Check if a byte position is in a gap (not downloaded yet)
   * @param {number} bytePos - Byte position
   * @returns {boolean}
   */
  const isInGap = (bytePos) => {
    for (const gap of gaps) {
      if (bytePos >= gap.start && bytePos < gap.end) {
        return true;
      }
    }
    return false;
  };

  /**
   * Check if a byte position is currently being requested
   * @param {number} bytePos - Byte position
   * @returns {boolean}
   */
  const isRequested = (bytePos) => {
    for (const req of requests) {
      if (bytePos >= req.start && bytePos <= req.end) {
        return true;
      }
    }
    return false;
  };

  /**
   * Get source count for a specific byte position
   * @param {number} byte - Byte position
   * @returns {number} Source count (0-255)
   */
  const getSourceCount = (byte) => {
    const partIndex = Math.floor(byte / PARTSIZE);
    if (partIndex < parts.length) {
      return parts[partIndex];
    }
    return 0;
  };

  /**
   * Get color for a specific byte position based on aMule algorithm
   * @param {number} byte - Byte position
   * @returns {string} RGB color string
   */
  const getByteColor = (byte) => {
    if (!isInGap(byte)) {
      // Downloaded — bright green (matches aMule crProgress)
      return 'rgb(0, 224, 0)';
    }

    // Missing portion
    if (isRequested(byte)) {
      // Currently being requested — gold (matches aMule crPending)
      return 'rgb(255, 208, 0)';
    }

    const sources = getSourceCount(byte);
    if (sources === 0) {
      // No sources — red (matches aMule crMissing)
      return 'rgb(255, 0, 0)';
    }
    // Blue gradient based on source count (inspired by aMule DownloadListCtrl):
    // Few sources → bright azure, many sources → dark navy
    // Both green and blue channels vary for a wider perceptual range
    const t = Math.min(sources - 1, 9) / 9; // 0..1 over 1-10 sources
    const g = Math.round(150 * (1 - t));     // 150 → 0
    const b = Math.round(255 - 80 * t);      // 255 → 175
    return `rgb(0, ${g}, ${b})`;
  };

  // Build color line for the progress bar
  const colorLine = [];
  for (let pixelX = 0; pixelX < width; pixelX++) {
    // Map pixel to byte position in file
    const bytePosition = Math.floor((pixelX / width) * fileSize);
    colorLine.push(getByteColor(bytePosition));
  }

  if (DEBUG) {
    // Sample the color line to see what we're rendering
    const colorSample = colorLine.slice(0, 10);
    console.log('[SegmentsBar] Color line sample (first 10 pixels):', colorSample);

    // Count colors
    const colorCounts = {};
    colorLine.forEach(color => {
      colorCounts[color] = (colorCounts[color] || 0) + 1;
    });
    console.log('[SegmentsBar] Color distribution:', colorCounts);

    // Test specific positions
    const testPositions = [0, Math.floor(fileSize / 2), fileSize - 1];
    testPositions.forEach(pos => {
      console.log(`[SegmentsBar] Byte ${pos}: inGap=${isInGap(pos)}, sources=${getSourceCount(pos)}, requested=${isRequested(pos)}`);
    });
    console.log('=== End SegmentsBar Debug ===');
  }

  // Group consecutive pixels with the same color into segments
  // This eliminates visual artifacts and improves rendering performance
  const segments = [];
  let currentColor = colorLine[0];
  let startX = 0;

  for (let i = 1; i <= colorLine.length; i++) {
    if (i === colorLine.length || colorLine[i] !== currentColor) {
      // End of segment - add to segments array
      segments.push({
        x: startX,
        width: i - startX,
        color: currentColor
      });

      // Start new segment
      if (i < colorLine.length) {
        currentColor = colorLine[i];
        startX = i;
      }
    }
  }

  // Render SVG with grouped segments instead of individual pixels
  // This fixes visual artifacts (bars/shadows) on solid color areas
  return h('svg', {
    viewBox: `0 0 ${width} ${height}`,
    style: {
      display: 'block',
      width: '100%',
      height: '100%'
    },
    preserveAspectRatio: 'none'
  },
    segments.map((segment, i) =>
      h('rect', {
        key: i,
        x: segment.x,
        y: 0,
        width: segment.width,
        height,
        fill: segment.color
      })
    )
  );
};

export default SegmentsBar;
