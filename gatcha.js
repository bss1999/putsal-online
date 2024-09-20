import express from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import { prisma } from "../utils/prisma/index.js";

const router = express.Router();


router.post("/gatcha", authMiddleware, async (req, res, next) => {
  try {
    //유저정보 전달받음
    const userId = req.user;

    //가챠비용 산정
    const cost = 1000;

    //해당 유저의 정보를 불러옴
    const user = await prisma.users.findFirst({
      where: {
        userId: userId.userId,
      },
    });

    //해당 유저의 재화가 가챠 비용보다 적으면 오류문출력
    if (user.cash < cost)
      return res.status(400).json({
        message: "보유한 금액이 모자랍니다!",
      });

    // 총합 100%가 되게 설정 후 랜덤함수로 해당 티어 출력
    const randomtierRate = Math.floor(Math.random() * 100);
    let tier = "";

    if (randomtierRate < 5) {
      // S = 5%
      tier = "S";
    } else if (randomtierRate < 25) {
      // A = 20%
      tier = "A";
    } else if (randomtierRate < 65) {
      // B = 40%
      tier = "B";
    } else if (randomtierRate < 100) {
      // C = 35%
      tier = "C";
    }

    //해당 티어에 해당되는 선수들의 목록을 불러옴
    const tierplayers = await prisma.player.findMany({
      where: {
        tier: tier,
      },
      select: {
        playerId: true,
        name: true,
        speed: true,
        goalDecisiveness: true,
        shootPower: true,
        defense: true,
        stamina: true,
        tier: true,
      },
    });

    //불러온 목록에서 랜덤으로 한 선수를 최종적으로 뽑음
    const pick_player =
      tierplayers[Math.floor(Math.random() * tierplayers.length)];

    //해당 선수를 이미 보유하고있는지 찾음
    const IsExistplayer = await prisma.playerWaitingList.findFirst({
      where: {
        userId: userId.userId,
        playerId: pick_player.playerId,
      },
    });


    //이미 뽑은선수가 대기소에 있을시 실행할 로직
    if (IsExistplayer) { 
      await prisma.$transaction(async (tx) => {
        // 트랜잭션 내부에서 유저 재화 감소 업데이트
        await tx.users.update({
          where: {
            userId: userId.userId,
          },
          data: {
            cash: { decrement: cost },
          },
        });

        // 트랜잭션 내부에서 선수 보유 카운트 +1 업데이트
        await tx.PlayerWaitingList.update({
          where: {
            PlayerListId: IsExistplayer.PlayerListId,
            userId: userId.userId,
            playerId: pick_player.playerId,
          },
          data: {
            count: { increment: 1 },
          },
        });
      });

      return res.status(201).json({
        message: `${tier}등급을 뽑았습니다! 이미 보유하고있는 선수이므로 보유숫자가 늘어납니다.`,
        data: pick_player,
      });
    }

    //뽑은선수가 대기소에 없을경우 실행할 로직
    await prisma.$transaction(async (tx) => {
      // 트랜잭션 내부에서 유저 재화 감소 업데이트
      await tx.users.update({
        where: {
          userId: userId.userId,
        },
        data: {
          cash: { decrement: cost },
        },
      });

      // 트랜잭션 내부에서 가챠로 뽑은 새 선수 대기소에 입소 처리
      await tx.PlayerWaitingList.create({
        data: {
          userId: userId.userId,
          playerId: pick_player.playerId,
          count: 1,
        },
      });
    });

    return res.status(201).json({
      message: `${tier}등급을 뽑았습니다!`,
      data: pick_player,
    });
  } catch (err) {
    next(err);
  }
});


router.get('/list', authMiddleware, async (req, res, next) => {
  try{
    //정보 전달받음
      const userId = req.user
      
      const user = await prisma.PlayerWaitingList.findMany({
          where: {
              userId: userId.userId,
            },
          select: {
            playerId: true,
            // playerName: true,
            count: true
          }
      })
    
      return res.status(200).json({ data: user });
  } catch (err) {
      next(err)
  }
});

export default router;
