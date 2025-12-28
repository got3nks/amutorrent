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
 * COLOR SCHEME:
 * - Green: Downloaded (complete)
 * - Yellow: Currently being requested from sources
 * - Blue: Missing with many sources (10+)
 * - Light Blue: Missing with moderate sources (5-9)
 * - Orange: Missing with few sources (1-4)
 * - Red: Missing with no sources
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
 * Parse gap status buffer into array of gap ranges (byte ranges)
 * Gaps are sent as RLE-encoded uint64 pairs (start, end)
 * @param {Buffer|Uint8Array|Object} gapStatus - Gap status buffer (may be serialized as {data: [], type: "Buffer"})
 * @returns {Array<{start: bigint, end: bigint}>} Array of gap byte ranges
 */
const parseGapStatus = (gapStatus) => {
  // Handle serialized Buffer format from JSON
  if (gapStatus && gapStatus.type === 'Buffer' && gapStatus.data) {
    gapStatus = new Uint8Array(gapStatus.data);
  } else if (gapStatus && !(gapStatus instanceof Uint8Array)) {
    gapStatus = new Uint8Array(gapStatus);
  }

  if (!gapStatus || gapStatus.length === 0) {
    if (DEBUG) console.log('[SegmentsBar] No gap status data');
    return [];
  }

  if (DEBUG) {
    console.log('[SegmentsBar] Gap status buffer length:', gapStatus.length);
    console.log('[SegmentsBar] First 32 bytes:', Array.from(gapStatus.slice(0, 32)));
  }

  try {
    // Decode RLE to uint64 array
    const decoded = decodeRLEtoUInt64(gapStatus);

    if (DEBUG) {
      console.log('[SegmentsBar] Decoded gap values:', decoded.length);
      if (decoded.length > 0) {
        console.log('[SegmentsBar] First 10 gap values:', Array.from(decoded.slice(0, 10)));
      }
    }

    // Gaps are pairs of uint64 values (start, end)
    const gaps = [];
    for (let i = 0; i < decoded.length; i += 2) {
      if (i + 1 < decoded.length) {
        gaps.push({
          start: decoded[i],
          end: decoded[i + 1]
        });
      }
    }

    if (DEBUG) {
      console.log('[SegmentsBar] Parsed gaps:', gaps.length);
      if (gaps.length > 0) {
        console.log('[SegmentsBar] First 5 gaps:', gaps.slice(0, 5).map(g => ({
          start: g.start.toString(),
          end: g.end.toString()
        })));
      }
    }

    return gaps;
  } catch (error) {
    console.error('[SegmentsBar] Error decoding gap status:', error);
    return [];
  }
};

/**
 * Parse requested parts buffer into array of byte ranges
 * Format: RLE-encoded uint64 pairs (start, end)
 * @param {Buffer|Uint8Array|Object} reqStatus - Request status buffer (may be serialized as {data: [], type: "Buffer"})
 * @returns {Array<{start: bigint, end: bigint}>} Array of requested byte ranges
 */
const parseReqStatus = (reqStatus) => {
  // Handle serialized Buffer format from JSON
  if (reqStatus && reqStatus.type === 'Buffer' && reqStatus.data) {
    reqStatus = new Uint8Array(reqStatus.data);
  } else if (reqStatus && !(reqStatus instanceof Uint8Array)) {
    reqStatus = new Uint8Array(reqStatus);
  }

  if (!reqStatus || reqStatus.length === 0) {
    if (DEBUG) console.log('[SegmentsBar] No request status data');
    return [];
  }

  if (DEBUG) {
    console.log('[SegmentsBar] Request status buffer length:', reqStatus.length);
    console.log('[SegmentsBar] First 32 bytes:', Array.from(reqStatus.slice(0, 32)));
  }

  try {
    // Decode RLE to uint64 array
    const decoded = decodeRLEtoUInt64(reqStatus);

    if (DEBUG) {
      console.log('[SegmentsBar] Decoded request values:', decoded.length);
      if (decoded.length > 0) {
        console.log('[SegmentsBar] First 10 request values:', Array.from(decoded.slice(0, 10)));
      }
    }

    // Requests are pairs of uint64 values (start, end)
    const requests = [];
    for (let i = 0; i < decoded.length; i += 2) {
      if (i + 1 < decoded.length) {
        requests.push({
          start: decoded[i],
          end: decoded[i + 1]
        });
      }
    }

    if (DEBUG) {
      console.log('[SegmentsBar] Parsed requests:', requests.length);
      if (requests.length > 0) {
        console.log('[SegmentsBar] First 5 requests:', requests.slice(0, 5).map(r => ({
          start: r.start.toString(),
          end: r.end.toString()
        })));
      }
    }

    return requests;
  } catch (error) {
    console.error('[SegmentsBar] Error decoding request status:', error);
    return [];
  }
};

/**
 * Parse part status buffer into array of source counts per part
 * Part status is RLE-encoded uint8 array where each value is the source count for that part
 * @param {Buffer|Uint8Array|Object} partStatus - Part status buffer (may be serialized as {data: [], type: "Buffer"})
 * @returns {Uint8Array} Array of source counts per part
 */
const parsePartStatus = (partStatus) => {
  // Handle serialized Buffer format from JSON
  if (partStatus && partStatus.type === 'Buffer' && partStatus.data) {
    partStatus = new Uint8Array(partStatus.data);
  } else if (partStatus && !(partStatus instanceof Uint8Array)) {
    partStatus = new Uint8Array(partStatus);
  }

  if (!partStatus || partStatus.length === 0) {
    if (DEBUG) console.log('[SegmentsBar] No part status data');
    return new Uint8Array(0);
  }

  if (DEBUG) {
    console.log('[SegmentsBar] Part status buffer length:', partStatus.length);
    console.log('[SegmentsBar] First 32 bytes:', Array.from(partStatus.slice(0, 32)));
  }

  try {
    // Decode RLE to uint8 array (source count per part)
    const decoded = decodeRLE(partStatus);

    if (DEBUG) {
      console.log('[SegmentsBar] Decoded part status length:', decoded.length);
      if (decoded.length > 0) {
        console.log('[SegmentsBar] First 20 parts:', Array.from(decoded.slice(0, 20)));
      }
    }

    return decoded;
  } catch (error) {
    console.error('[SegmentsBar] Error decoding part status:', error);
    return new Uint8Array(0);
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
   * @param {number} byte - Byte position
   * @returns {boolean}
   */
  const isInGap = (byte) => {
    const bytePos = BigInt(byte);
    for (const gap of gaps) {
      if (bytePos >= gap.start && bytePos <= gap.end) {
        return true;
      }
    }
    return false;
  };

  /**
   * Check if a byte position is currently being requested
   * @param {number} byte - Byte position
   * @returns {boolean}
   */
  const isRequested = (byte) => {
    const bytePos = BigInt(byte);
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
      // Downloaded - green
      return 'rgb(0, 200, 0)';
    }

    // Missing portion
    if (isRequested(byte)) {
      // Currently being requested - yellow
      return 'rgb(255, 255, 0)';
    }

    const sources = getSourceCount(byte);
    if (sources === 0) {
      // No sources - red
      return 'rgb(255, 0, 0)';
    } else if (sources < 5) {
      // Few sources - orange
      return 'rgb(255, 165, 0)';
    } else if (sources < 10) {
      // Moderate sources - light blue
      return 'rgb(100, 150, 255)';
    } else {
      // Many sources - blue
      return 'rgb(0, 100, 255)';
    }
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
