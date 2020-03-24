import { openNewDevice, NetMDInterface, Disc, listContent, openPairedDevice, Wireformat, MDTrack, download } from 'netmd-js';
import { makeGetAsyncPacketIteratorOnWorkerThread } from 'netmd-js/dist/web-encrypt-worker';

const Worker = require('worker-loader!netmd-js/dist/web-encrypt-worker.js'); // eslint-disable-line import/no-webpack-loader-syntax

export interface NetMDService {
    pair(): Promise<boolean>;
    connect(): Promise<boolean>;
    listContent(): Promise<Disc>;
    getDeviceName(): Promise<string>;
    finalize(): Promise<void>;
    renameTrack(index: number, newTitle: string): Promise<void>;
    renameDisc(newName: string): Promise<void>;
    deleteTrack(index: number): Promise<void>;
    wipeDisc(): Promise<void>;
    upload(
        title: string,
        data: ArrayBuffer,
        format: Wireformat,
        progressCallback: (progress: { written: number; encrypted: number; total: number }) => void
    ): Promise<void>;
}

export class NetMDUSBService implements NetMDService {
    private netmdInterface?: NetMDInterface;

    async pair() {
        let iface = await openNewDevice(navigator.usb);
        if (iface === null) {
            return false;
        }
        this.netmdInterface = iface;
        return true;
    }

    async connect() {
        let iface = await openPairedDevice(navigator.usb);
        if (iface === null) {
            return false;
        }
        this.netmdInterface = iface;
        return true;
    }

    async listContent() {
        return await listContent(this.netmdInterface!);
    }

    async getDeviceName() {
        return await this.netmdInterface!.netMd.getDeviceName();
    }

    async finalize() {
        await this.netmdInterface!.netMd.finalize();
    }

    async renameTrack(index: number, newTitle: string) {
        await this.netmdInterface!.setTrackTitle(index, newTitle);
    }

    async renameDisc(newName: string) {
        const oldName = await this.netmdInterface!.getDiscTitle();
        let newNameWithGroups = await this.netmdInterface!._getDiscTitle();
        newNameWithGroups = newNameWithGroups.replace(oldName, newName);
        await this.netmdInterface!.cacheTOC();
        await this.netmdInterface!.setDiscTitle(newNameWithGroups);
        await this.netmdInterface!.syncTOC();
    }

    async deleteTrack(index: number) {
        await this.netmdInterface!.eraseTrack(index);
    }

    async wipeDisc() {
        await this.netmdInterface!.eraseDisc();
    }

    async upload(
        title: string,
        data: ArrayBuffer,
        format: Wireformat,
        progressCallback: (progress: { written: number; encrypted: number; total: number }) => void
    ) {
        let total = data.byteLength;
        let written = 0;
        let encrypted = 0;
        function updateProgress() {
            progressCallback({ written, encrypted, total });
        }

        let w = new Worker();

        let webWorkerAsyncPacketIterator = makeGetAsyncPacketIteratorOnWorkerThread(w, ({ encryptedBytes }) => {
            encrypted = encryptedBytes;
            updateProgress();
        });

        let mdTrack = new MDTrack(title, format, data, 0x80000, webWorkerAsyncPacketIterator);

        await download(this.netmdInterface!, mdTrack, ({ writtenBytes }) => {
            written = writtenBytes;
            updateProgress();
        });
    }
}