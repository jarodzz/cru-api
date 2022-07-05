import { create } from 'ipfs-http-client';
import { ethers } from 'ethers';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';


import pkg from 'express';
const app = pkg()
app.use(pkg.json());
const port = 3000

async function addFileToIpfs(fileContent) {
  const pair = ethers.Wallet.createRandom();
  const sig = await pair.signMessage(pair.address);
  const authHeaderRaw = `eth-${pair.address}:${sig}`;
  const authHeader = Buffer.from(authHeaderRaw).toString('base64');
  const ipfsW3GW = 'https://crustipfs.xyz';

  const ipfs = create({
      url: `${ipfsW3GW}/api/v0`,
      headers: {
          authorization: `Basic ${authHeader}`
      }
  });

  const ifile = await ipfs.add(fileContent);
  console.log(ifile);

  const fileStat = await ipfs.files.stat("/ipfs/" + ifile.path);
  console.log(fileStat);
  return {
      cid: ifile.path,
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
const wsProvider = new WsProvider('wss://rpc.crust.network');
const api = await ApiPromise.create({provider: wsProvider});

async function addFileToCru(cid, size) {
    const tips = 0.01;
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

app.post('/cruapi/getfile', async (req, res) => {
    const fid = req.body['file'];
    console.log(fid);
    const content = await getFileFromIpfs(fid);
    // retrieve file id from cru network, and return the content
    res.json({'data': content})
})

app.post('/cruapi/putfile', async (req, res) => {
    const fcontent = req.body['file'];
    console.log("adding file ", fcontent);
    const ipfs_result = await addFileToIpfs(fcontent);
    console.log("ipfs result ", ipfs_result);
    const cru_result = await addFileToCru(ipfs_result['cid'], ipfs_result['size']);
    // upload file to crust network, and return the id
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})

