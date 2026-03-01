import { Device } from 'https://esm.sh/mediasoup-client@3.18.6?bundle';

export function createMediaClient({ request, audioController, producerMap, consumerMap, peerRenderer, getDeafened }) {
  let device;
  let sendTransport;
  let recvTransport;

  async function initDevice(rtpCapabilities) {
    device = new Device();
    await device.load({ routerRtpCapabilities: rtpCapabilities });
  }

  async function createTransports() {
    const sendTransportInfo = await request('createTransport', { direction: 'send' });
    sendTransport = device.createSendTransport({
      id: sendTransportInfo.transportId,
      iceParameters: sendTransportInfo.iceParameters,
      iceCandidates: sendTransportInfo.iceCandidates,
      dtlsParameters: sendTransportInfo.dtlsParameters
    });

    sendTransport.on('connect', ({ dtlsParameters }, callback) => {
      request('connectTransport', { transportId: sendTransportInfo.transportId, dtlsParameters }).then(callback);
    });

    sendTransport.on('produce', async ({ kind, rtpParameters }, callback) => {
      const produced = await request('produce', {
        transportId: sendTransportInfo.transportId,
        kind,
        rtpParameters
      });
      callback({ id: produced.producerId });
    });

    const recvTransportInfo = await request('createTransport', { direction: 'recv' });
    recvTransport = device.createRecvTransport({
      id: recvTransportInfo.transportId,
      iceParameters: recvTransportInfo.iceParameters,
      iceCandidates: recvTransportInfo.iceCandidates,
      dtlsParameters: recvTransportInfo.dtlsParameters
    });

    recvTransport.on('connect', ({ dtlsParameters }, callback) => {
      request('connectTransport', { transportId: recvTransportInfo.transportId, dtlsParameters }).then(callback);
    });
  }

  async function produceTrack(track) {
    if (!sendTransport) {
      throw new Error('send_transport_missing');
    }
    await sendTransport.produce({ track });
  }

  async function consumeProducer(producerId) {
    if (!recvTransport || !device) {
      throw new Error('recv_transport_missing');
    }
    const data = await request('consume', {
      transportId: recvTransport.id,
      producerId,
      rtpCapabilities: device.rtpCapabilities
    });
    if (data.type === 'cannotConsume') {
      return;
    }
    const consumer = await recvTransport.consume({
      id: data.consumerId,
      producerId: data.producerId,
      kind: data.kind,
      rtpParameters: data.rtpParameters
    });
    const stream = new MediaStream([consumer.track]);
    const audio = document.createElement('audio');
    audio.srcObject = stream;
    audio.autoplay = true;
    document.body.appendChild(audio);
    const context = audioController.getAudioContext();
    const source = context.createMediaElementSource(audio);
    const gainNode = context.createGain();
    source.connect(gainNode).connect(context.destination);
    consumerMap.set(producerId, { audio, gainNode, consumer });
    await request('resume', { consumerId: data.consumerId });
    if (getDeafened()) {
      gainNode.gain.value = 0;
    }
    peerRenderer.onPeerAdded();
    peerRenderer.updateVolumes();
  }

  return {
    initDevice,
    createTransports,
    produceTrack,
    consumeProducer
  };
}
