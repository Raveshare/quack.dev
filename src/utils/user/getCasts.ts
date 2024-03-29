import { fc } from "../clients/fc";
import prisma from "../clients/prisma";
import getReactionForCast from "../casts/getReactionForCast";
import { CastId, fromFarcasterTime } from "@farcaster/hub-nodejs";

const getCasts = async (user_id: string) => {
  let m = [] as any[];

  const user_fid = await prisma.user_metadata.findUnique({
    where: {
      user_id,
    },
    select: {
      fid: true,
    },
  });

  if (user_fid?.fid === undefined) {
    return m;
  }

  const casts = await fc.getCastsByFid({
    fid: user_fid?.fid as number,
    pageSize: 100,
    reverse: true,
  });

  if (casts.isOk()) {
    for (let i = 0; i < casts.value.messages.length; i++) {
      let cast = casts.value.messages[i];
      let reaction = await getReactionForCast(
        CastId.create({
          fid: user_fid?.fid as number,
          hash: cast.hash,
        })
      );
      m.push({
        body: cast.data?.castAddBody?.text as string,
        embeds: cast.data?.castAddBody?.embeds as any[],
        reaction: reaction,
        timestamp : cast.data?.timestamp ? new Date(fromFarcasterTime(cast.data.timestamp)._unsafeUnwrap()).toISOString() : "",
        hash: `0x${Buffer.from(cast.hash).toString("hex")}`,
        fid: cast.data?.fid
      });
    }
  }

  return m;
};

export default getCasts;
