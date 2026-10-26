// frontend/src/lib/moveRequestApi.js
// Memilih fungsi API sesuai jenis permintaan. Fungsi dipanggil secara malas (di dalam fungsi pembungkus) supaya hanya fungsi yang dipakai yang dirujuk.
import * as api from '../api'

export const moveApi = (kind) => (kind === 'sample'
  ? {
      list: (...a) => api.getSampleRequests(...a),
      get: (...a) => api.getSampleRequest(...a),
      create: (...a) => api.createSampleRequest(...a),
      update: (...a) => api.updateSampleRequest(...a),
      onhand: (...a) => api.checkSampleRequestOnHand(...a),
      move: (...a) => api.saveSampleRequestMove(...a),
      transfer: (...a) => api.saveSampleRequestTransfer(...a),
      issue: (...a) => api.saveSampleRequestIssue(...a),
      complete: (...a) => api.completeSampleRequest(...a),
    }
  : {
      list: (...a) => api.getMoveRequests(...a),
      events: (...a) => api.getMoveRequestEvents(...a),
      get: (...a) => api.getMoveRequest(...a),
      create: (...a) => api.createMoveRequest(...a),
      update: (...a) => api.updateMoveRequest(...a),
      onhand: (...a) => api.checkMoveRequestOnHand(...a),
      move: (...a) => api.saveMoveRequestMove(...a),
      transfer: (...a) => api.saveMoveRequestTransfer(...a),
      issue: (...a) => api.saveMoveRequestIssue(...a),
      complete: (...a) => api.completeMoveRequest(...a),
    })