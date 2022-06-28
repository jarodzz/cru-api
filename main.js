import { create } from 'ipfs-http-client'
import { ethers } from 'ethers';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { typesBundleForPolkadot, crustTypes } from '@crustio/type-definitions';
import { Keyring } from '@polkadot/keyring';
import { KeyringPair } from '@polkadot/keyring/types';


const express = require('express')
const app = express()
app.use(express.json());
const port = 3000

async function addFileToIpfs(fileContent) {
  // 0. Construct web3 authed header
  // Now support: ethereum-series, polkadot-series, solana, elrond, flow, near, ...
  // Let's take ethereum as example
  const pair = ethers.Wallet.createRandom();
  const sig = await pair.signMessage(pair.address);
  const authHeaderRaw = `eth-${pair.address}:${sig}`;
  const authHeader = Buffer.from(authHeaderRaw).toString('base64');
  const ipfsW3GW = 'https://crustipfs.xyz';

  // 1. Create IPFS instant
  const ipfs = create({
      url: `${ipfsW3GW}/api/v0`,
      headers: {
          authorization: `Basic ${authHeader}`
      }
  });

  // 2. Add file to ipfs
  const { cid } = await ipfs.add(fileContent);

  // 3. Get file status from ipfs
  const fileStat = await ipfs.files.stat("/ipfs/" + cid.path);

  return {
      cid: cid.path,
      size: fileStat.cumulativeSize
  };
}

async function getFileFromIpfs(cid) {
  // 0. Construct web3 authed header
  // Now support: ethereum-series, polkadot-series, solana, elrond, flow, near, ...
  // Let's take ethereum as example
  const pair = ethers.Wallet.createRandom();
  const sig = await pair.signMessage(pair.address);
  const authHeaderRaw = `eth-${pair.address}:${sig}`;
  const authHeader = Buffer.from(authHeaderRaw).toString('base64');
  const ipfsW3GW = 'https://crustipfs.xyz';

  // 1. Create IPFS instant
  const ipfs = create({
      url: `${ipfsW3GW}/api/v0`,
      headers: {
          authorization: `Basic ${authHeader}`
      }
  });

  const { content } = await ipfs.cat(cid);

  return content;
}


// Create global chain instance
const crustChainEndpoint = 'wss://rpc.crust.network';
const api = new ApiPromise({
    provider: new WsProvider(crustChainEndpoint),
    typesBundle: typesBundleForPolkadot,
});

async function addFileToCru(cid, size) {
    const tips = 0;
    const memo = '';
    const tx = api.tx.market.placeStorageOrder(cid, size, tips, memo);

    const seeds = 'xxx xxx xxx xxx xxx xxx xxx xxx xxx xxx xxx xxx';
    const kr = new Keyring({ type: 'sr25519' });
    const krp = kr.addFromUri(seeds);

    await api.isReadyOrError;
    return new Promise((resolve, reject) => {
        tx.signAndSend(krp, ({events = [], status}) => {
            console.log("Tx status: ${status.type}, nonce: ${tx.nonce}");
            if (status.isInBlock) {
                events.forEach(({event: {method, section}}) => {
                    if (method === 'ExtrinsicSuccess') {
                        console.log("Place storage order success!");
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

app.get('/cruapi/health', (req, res) => {
  res.send('CruApi is up and running!')
})

app.post('/cruapi/getfile', (req, res) => {
    const fid = req.body['file'];
    console.log(fid);
    const content = await getFileFromIpfs(fid);
    // retrieve file id from cru network, and return the content
    res.json({'data': content})
})

app.post('/cruapi/putfile', (req, res) => {
    const fcontent = req.body['file'];
    console.log(fcontent);
    const ipfs_result = await addFileToIpfs(fcontent);
    const cru_result = await addFileToCru(ipfs_result['cid'], ipfs_result['size']);
    // upload file to crust network, and return the id
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})

