import {
  ViemLocalEip712Signer,
  KEY_GATEWAY_ADDRESS,
  keyGatewayABI,
  NobleEd25519Signer,
  BUNDLER_ADDRESS,
  bundlerABI,
} from "@farcaster/hub-nodejs";
import { bytesToHex, createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { optimism } from "viem/chains";
import { decrypt } from "../../utils/auth/decrypt";
import bs58 from "bs58";

import prisma from "../clients/prisma";
import getAccountExists from "../user/getAccountExists";

import { Web3 } from "web3";
import getFIDFromOwner from "./getFIDFromOwner";

const web3 = new Web3(process.env.OP_RPC_URL);
const hub = new web3.eth.Contract(bundlerABI, BUNDLER_ADDRESS);

const APP_FID = BigInt(process.env.APP_FID as string);

export const createAccount = async (userId: string)  => {
  console.log("Creating account");

  let accStatus = await getAccountExists(userId);
  if (accStatus.fid) {
    console.error("Account already exists");
    return accStatus.fid;
  } else {
    const publicClient = createPublicClient({
      chain: optimism,
      transport: http(),
    });

    const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY as `0x${string}`;
    const app = privateKeyToAccount(APP_PRIVATE_KEY);
    const appKey = new ViemLocalEip712Signer(app as any);

    const walletClient = createWalletClient({
      account: app,
      chain: optimism,
      transport: http(),
    });

    const WARPCAST_RECOVERY_PROXY = process.env
      .WARPCAST_RECOVERY_PROXY as `0x${string}`;

    let user_pk = await prisma.auth.findUnique({
      where: {
        user_id: userId,
      },
      select: {
        secret_key: true,
      },
    });
    if (!user_pk) {
      console.error("User does not exist");
    }
    const user_pk_decrypted = decrypt(user_pk?.secret_key as `0x${string}`);
    const user = privateKeyToAccount(user_pk_decrypted as `0x${string}`);
    const userKey = new ViemLocalEip712Signer(user as any);

    const getDeadline = () => {
      const now = Math.floor(Date.now() / 1000);
      const oneHour = 60 * 60;
      return BigInt(now + oneHour);
    };

    let nonce = await publicClient.readContract({
      address: KEY_GATEWAY_ADDRESS,
      abi: keyGatewayABI,
      functionName: "nonces",
      args: [user.address],
    });

    let deadline = getDeadline();

    let regSig = await userKey.signRegister({
      to: user.address,
      recovery: WARPCAST_RECOVERY_PROXY,
      nonce,
      deadline,
    });

    const accKey = new NobleEd25519Signer(
      bs58.decode(process.env.APP_ACCOUNT_PRIVATE_KEY as string)
    );
    const accKeyResult = await accKey.getSignerKey();
    let signedKeyRequestMetadata;
    if (accKeyResult.isOk()) {
      let accountPubKey = accKeyResult.value;

      signedKeyRequestMetadata = await appKey.getSignedKeyRequestMetadata({
        requestFid: APP_FID,
        key: accountPubKey,
        deadline,
      });

      if (signedKeyRequestMetadata?.isOk()) {
        const metadata = bytesToHex(signedKeyRequestMetadata.value);

        let nonce = await publicClient.readContract({
          address: KEY_GATEWAY_ADDRESS,
          abi: keyGatewayABI,
          functionName: "nonces",
          args: [user.address],
        });

        const addSignature = await userKey.signAdd({
          owner: user.address,
          keyType: 1,
          key: accKeyResult.value,
          metadataType: 1,
          metadata,
          nonce,
          deadline,
        });

        if (regSig.isOk()) {
          if (addSignature.isOk()) {
            const price = await publicClient.readContract({
              address: BUNDLER_ADDRESS,
              abi: bundlerABI,
              functionName: "price",
              args: [0n],
            });

            const { request } = await publicClient.simulateContract({
              account: app,
              address: BUNDLER_ADDRESS,
              abi: bundlerABI,
              functionName: "register",
              args: [
                {
                  to: user.address,
                  recovery: WARPCAST_RECOVERY_PROXY,
                  sig: bytesToHex(regSig.value),
                  deadline,
                },
                [
                  {
                    keyType: 1,
                    key: bytesToHex(accountPubKey),
                    metadataType: 1,
                    metadata: metadata,
                    sig: bytesToHex(addSignature.value),
                    deadline,
                  },
                ],
                0n,
              ],
              value: price,
            });
            let tx = await walletClient.writeContract(request);

            let recipet = await publicClient.waitForTransactionReceipt({
              confirmations: 1,
              hash: tx,
            });

            let fid = await getFIDFromOwner(user.address);

            await prisma.user_metadata.upsert({
              where: {
                user_id: userId,
              },
              create: {
                user_id: userId,
                hasPaid: true,
                fid: fid,
              },
              update: {
                hasPaid: true,
                fid: fid,
              },
            });

            return fid;
          }
        }
      }
    }
  }

  return accStatus.fid;

  // const pubKeyForUser = await ed.getPublicKey(pvtKeyBytes);
  // way to make a solana keypair
  // const solPair = new Uint8Array(64);
  // solPair.set(pvtKeyBytes);
  // solPair.set(pubKeyForUser, 32);
};

export const getPriceInEth = async () => {
  let price = await hub.methods.price(0).call();
  price = web3.utils.fromWei(price, "ether");
  price = parseFloat(price);
  return price;
};

export default createAccount;
