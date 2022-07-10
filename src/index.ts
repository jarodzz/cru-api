import fs from 'fs';
import path from 'path';
import { create, IPFSHTTPClient } from 'ipfs-http-client';
import { ethers } from 'ethers';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { typesBundleForPolkadot } from '@crustio/type-definitions';
import { Keyring } from '@polkadot/keyring';
import express from 'express';

const crustChainEndpoint = 'wss://rpc.crust.network'; // More endpoints: https://github.com/crustio/crust-apps/blob/master/packages/apps-config/src/endpoints/production.ts#L9
const ipfsW3GW = 'https://crustipfs.xyz'; // More web3 authed gateways: https://github.com/crustio/ipfsscan/blob/main/lib/constans.ts#L29
const crustSeeds = 'xxxx'; // Create account(seeds): https://wiki.crust.network/docs/en/crustAccount
const api = new ApiPromise({
    provider: new WsProvider(crustChainEndpoint),
    typesBundle: typesBundleForPolkadot,
});
const ipfsAccount = ethers.Wallet.createRandom();

const app: express.Application = express();
app.use(express.json())

const port: number = 3000;

app.get('/cruapi/health', (req: any, res: any) => {
    res.send('CruApi is up and running!')
})

app.post('/cruapi/getfile', async (req: any, res: any) => {
    const fid = req.body['key'];
    console.log(fid);
    const content = await catFile(fid);
    // retrieve file id from cru network, and return the content
    res.json({key: content})
})

app.post('/cruapi/putfile', async (req, res) => {
    console.log(req);
    const fcontent = req.body['key'];
    const cid = await putFileTo(fcontent);
    res.json({key: cid})
})

app.listen(port, () => {
console.log(`Example app listening on port ${port}`)
})

async function putFileTo(fileContent: String) {
    const sig = await ipfsAccount.signMessage(ipfsAccount.address);
    const authHeaderRaw = `eth-${ipfsAccount.address}:${sig}`;
    const authHeader = Buffer.from(authHeaderRaw).toString('base64');

    const ipfsRemote = create({
        url: `${ipfsW3GW}/api/v0`,
        headers: {
            authorization: `Basic ${authHeader}`
        }
    });

    const rst = await addFile(ipfsRemote, fileContent); // Or use IPFS local
    console.log(rst);
    // II. Place storage order
    await placeStorageOrder(rst.cid, rst.size);
    // III. [OPTIONAL] Add prepaid
    // Learn what's prepard for: https://wiki.crust.network/docs/en/DSM#3-file-order-assurance-settlement-and-discount
    const addedAmount = 100; // in pCRU, 1 pCRU = 10^-12 CRU
    await addPrepaid(rst.cid, addedAmount);
    return rst.cid;
}

async function addFile(ipfs: IPFSHTTPClient, fileContent: any) {
    // 1. Add file to ipfs
    const cid = await ipfs.add(fileContent);

    // 2. Get file status from ipfs
    const fileStat = await ipfs.files.stat("/ipfs/" + cid.path);

    return {
        cid: cid.path,
        size: fileStat.cumulativeSize
    };
}

async function catFile(cid: any) {
    const sig = await ipfsAccount.signMessage(ipfsAccount.address);
    const authHeaderRaw = `eth-${ipfsAccount.address}:${sig}`;
    const authHeader = Buffer.from(authHeaderRaw).toString('base64');
    const ipfsRemote = create({
        url: `${ipfsW3GW}/api/v0`,
        headers: {
            authorization: `Basic ${authHeader}`
        }
    });
    const content = await ipfsRemote.cat(cid);
    var buffer = "";
    for await (const item of content) {
        console.log('item', item.toString());
        buffer += item.toString();
    }
    return buffer;
}

async function placeStorageOrder(fileCid: string, fileSize: number) {
    // 1. Construct place-storage-order tx
    const tips = 0;
    const memo = '';
    const tx = api.tx.market.placeStorageOrder(fileCid, fileSize, tips, memo);

    // 2. Load seeds(account)
    const kr = new Keyring({ type: 'sr25519' });
    const krp = kr.addFromUri(crustSeeds);

    // 3. Send transaction
    await api.isReadyOrError;
    return new Promise((resolve, reject) => {
        tx.signAndSend(krp, ({events = [], status}) => {
            console.log(`💸  Tx status: ${status.type}, nonce: ${tx.nonce}`);

            if (status.isInBlock) {
                events.forEach(({event: {method, section}}) => {
                    if (method === 'ExtrinsicSuccess') {
                        console.log(`✅  Place storage order success!`);
                        resolve(true);
                    }
                });
            } else {
                // Pass it
            }
        }).catch(e => {
            reject(e);
        })
    });
}

async function addPrepaid(fileCid: string, amount: number) {
    // 1. Construct add-prepaid tx
    const tx = api.tx.market.addPrepaid(fileCid, amount);

    // 2. Load seeds(account)
    const kr = new Keyring({ type: 'sr25519' });
    const krp = kr.addFromUri(crustSeeds);

    // 3. Send transaction
    await api.isReadyOrError;
    return new Promise((resolve, reject) => {
        tx.signAndSend(krp, ({events = [], status}) => {
            console.log(`💸  Tx status: ${status.type}, nonce: ${tx.nonce}`);

            if (status.isInBlock) {
                events.forEach(({event: {method, section}}) => {
                    if (method === 'ExtrinsicSuccess') {
                        console.log(`✅  Add prepaid success!`);
                        resolve(true);
                    }
                });
            } else {
                // Pass it
            }
        }).catch(e => {
            reject(e);
        })
    });
}

async function getOrderState(cid: string) {
    await api.isReadyOrError;
    return await api.query.market.filesV2(cid);
}
