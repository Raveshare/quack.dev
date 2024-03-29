import { Router } from "express";
import createAccount, { getPriceInEth } from "../../utils/farcaster/createAccount";
import {
  getPriceInSol,
  getPriceInUSDC,
} from "../../utils/solana/getPriceInSol";
import getSerializedTx from "../../utils/solana/getSerializedTx";
import checkTransactionStatus from "../../utils/solana/checkTransactionStatus";
import getParsedTransaction from "../../utils/solana/getParsedTransaction";
import updatePaidStatus from "../../utils/user/updatePaidStatus";
import getAccountExists from "../../utils/user/getAccountExists";

const router = Router();

router.get("/pay", async (req, res) => {
  let user = req.user?.id;
  let publicKey = req.user?.public_address;

  let accountExists = await getAccountExists(user as string);

  if (accountExists.fid) {
    res.send({
      message: "Account already exists",
    });
    return;
  }

  let price = await getPriceInEth();
  let priceInSol = await getPriceInSol(price);
  let priceInUSDC = await getPriceInUSDC(price);
  let tx = await getSerializedTx(priceInSol, publicKey as string);

  res.send({
    price: price,
    priceInSol: priceInSol,
    priceInUSDC: priceInUSDC,
    tx: tx,
  });
});

router.post("/pay", async (req, res) => {
  let user = req.user?.id;
  let publicKey = req.user?.public_address;
  let txSig = req.body.txSig;

  let accountExists = await getAccountExists(user as string);

  console.log(accountExists)

  if (accountExists.fid) {
    res.send({
      message: "Account already exists",
    });
    return;
  }

  let status = await checkTransactionStatus(txSig);

  console.log(status)

  if (status) {
    let parsedTx = await getParsedTransaction(txSig);
    console.log(parsedTx)
    let fid = await updatePaidStatus(
      user as string,
      publicKey as string,
      parsedTx as string
    );
    console.log(fid)

    res.send({
      status: status,
      fid: fid,
    });
    return;
  }

  res.send({
    status: status,
  });
});

export default router;
