"use client";

import { useEffect, Dispatch, SetStateAction } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { NetworkManager } from "@/common/network";
import { sha256 } from "js-sha256";
import { Button } from "@mui/material";
import { jwtDecode } from "jwt-decode";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  generateRandomness,
  generateNonce,
  jwtToAddress,
} from "@mysten/zklogin";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import google_logo from "@/assets/google_logo.png";

export const LoginModal = ({
  setIsLogin,
}: {
  setIsLogin: Dispatch<SetStateAction<boolean>>;
}) => {
  const pathName = usePathname();

  useEffect(() => {
    const hash = window.location.hash;
    const login = async (token: string) => {
      const decoded_jwt = jwtDecode(token);
      const sub = decoded_jwt.sub;
      const iss = decoded_jwt.iss;
      const aud = decoded_jwt.aud;
      if (sub && iss && aud) {
        let docId = sha256(sub + iss + aud);
        try {
          const res = await NetworkManager.login(docId);
          const address = jwtToAddress(token, res.data.salt);
          setIsLogin(true);
          window.sessionStorage.setItem("USER_DOC_ID", docId);
          window.sessionStorage.setItem("SUI_ADDRESS", address);
        } catch (error) {
          setIsLogin(false);
        } finally {
          window.history.replaceState(null, "", window.location.pathname);
        }
      }
    };
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get("id_token");
      if (token) {
        login(token);
      }
    }
  }, [pathName, setIsLogin]);

  return (
    <dialog id="my_modal_4" className="modal">
      <div className="modal-box w-fit bg-opacity-10 backdrop-blur-md">
        <div>
          <div className="flex justify-between items-center">
            <p className="text-left font-bold text-lg text-white">Sign in</p>
            <form method="dialog">
              {/* if there is a button in form, it will close the modal */}
              <button className="text-white cursor-pointer">x</button>
            </form>
          </div>
          <div className="modal-action flex flex-col justify-center items-center">
            <button
              className=" text-white p-2 rounded-lg shadow-inner border border-white hover:scale-105 transition-all duration-300"
              onClick={async () => {
                const epk = Ed25519Keypair.generate();
                window.sessionStorage.setItem("EPK_SECRET", epk.getSecretKey());
                const randomness = generateRandomness();
                window.sessionStorage.setItem("RANDOMNESS", randomness);
                const rpcUrl = getFullnodeUrl("devnet");
                const suiClient = new SuiClient({
                  url: rpcUrl,
                });
                const suiSysState = await suiClient.getLatestSuiSystemState();
                const currentEpoch = suiSysState.epoch;
                let maxEpoch: number = parseInt(currentEpoch) + 10;
                const nonce = generateNonce(
                  epk.getPublicKey(),
                  maxEpoch,
                  randomness
                );
                console.log(nonce);
                const params = new URLSearchParams({
                  client_id: process.env.NEXT_PUBLIC_AUTH_CLIENT_ID!,
                  redirect_uri: process.env.NEXT_PUBLIC_REDIRECT_URI!,
                  response_type: "id_token",
                  scope: "openid",
                  nonce: nonce,
                });
                const loginURL = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
                window.location.replace(loginURL);
              }}
            >
              <div className="flex items-center">
                <Image
                  src={google_logo}
                  alt="google_logo"
                  width={25}
                  height={25}
                />
                <span className="ml-4">Sign In With Google</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
};
