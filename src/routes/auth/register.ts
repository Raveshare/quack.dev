import { Router } from "express";
import { getPriceInEth } from "../../utils/farcaster/createAccount";
import {
  getPriceInSol,
  getPriceInUSDC,
} from "../../utils/solana/getPriceInSol";
import getSerializedTx from "../../utils/solana/getSerializedTx";
import checkTransactionStatus from "../../utils/solana/checkTransactionStatus";
import getParsedTransaction from "../../utils/solana/getParsedTransaction";
import updatePaidStatus from "../../utils/user/updatePaidStatus";
const router = Router();

router.get("/pay", async (req, res) => {
  let user = req.user?.id;
  let publicKey = req.user?.public_address;

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

  let status = await checkTransactionStatus(txSig);

  if (status) {
    let parsedTx = await getParsedTransaction(txSig);
    console.log(parsedTx);
    await updatePaidStatus(
      user as string,
      publicKey as string,
      parsedTx as string
    );
  }

  res.send({
    status: status,
  });
});

export default router;