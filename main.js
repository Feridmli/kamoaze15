// ===================== MAIN.JS (YENİLƏNMİŞ SÜRÜM - BigNumber Düzəlişi ilə) =====================
import { ethers } from "ethers";
import { Seaport } from "@opensea/seaport-js";

// ===================== CONFIG =====================
const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  window?.__BACKEND_URL__ ||
  "https://kamoaze20.onrender.com";

const NFT_CONTRACT_ADDRESS =
  import.meta.env.VITE_NFT_CONTRACT ||
  window?.__NFT_CONTRACT__ ||
  "0x54a88333F6e7540eA982261301309048aC431eD5";

const SEAPORT_CONTRACT_ADDRESS =
  import.meta.env.VITE_SEAPORT_CONTRACT ||
  window?.__SEAPORT_CONTRACT__ ||
  "0x0000000000000068F116a894984e2DB1123eB395"; // canonical 1.6

const APECHAIN_ID = 33139;
const APECHAIN_ID_HEX = "0x8173";

// ===================== GLOBALS =====================
let provider = null;
let signer = null;
let seaport = null;
let userAddress = null;

// ===================== UI ELEMENTS =====================
const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const addrSpan = document.getElementById("addr");
const marketplaceDiv = document.getElementById("marketplace");
const noticeDiv = document.getElementById("notice");

// ===================== UTIL =====================
function notify(msg, timeout = 3000) {
  noticeDiv.textContent = msg;
  if (timeout)
    setTimeout(() => {
      if (noticeDiv.textContent === msg) noticeDiv.textContent = "";
    }, timeout);
}

// DÜZƏLİŞ: Daha etibarlı Ethers v5 BigNumber serializasiyası
function orderToJsonSafe(obj) {
  return JSON.parse(
    JSON.stringify(obj, (k, v) => {
      // Ethers.js BigNumber obyektini String-ə çevirir
      if (v && typeof v === "object" && v.type === 'BigNumber' && v.hex) {
          try {
              return ethers.BigNumber.from(v.hex).toString();
          } catch {
              return v.hex;
          }
      }
      // Ümumi hex dəyərləri (Ünvan/Hash)
      if (v && typeof v === "object" && v._hex) return v._hex;
      if (typeof v === "function" || typeof v === "undefined") return;
      return v;
    })
  );
}

// ===================== CONNECT WALLET =====================
async function connectWallet() {
  try {
    if (!window.ethereum) return alert("Metamask tapılmadı!");

    provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    userAddress = (await signer.getAddress()).toLowerCase();

    const network = await provider.getNetwork();
    if (network.chainId !== APECHAIN_ID) {
      try {
        await provider.send("wallet_addEthereumChain", [
          {
            chainId: APECHAIN_ID_HEX,
            chainName: "ApeChain Mainnet",
            nativeCurrency: { name: "APE", symbol: "APE", decimals: 18 },
            rpcUrls: [import.meta.env.APECHAIN_RPC || "https://rpc.apechain.com"],
            blockExplorerUrls: ["https://apescan.io"],
          },
        ]);
        notify("Şəbəkə əlavə edildi, yenidən qoşun.");
        return;
      } catch (e) {
        console.error(e);
      }
    }

    seaport = new Seaport(signer, { contractAddress: SEAPORT_CONTRACT_ADDRESS });

    connectBtn.style.display = "none";
    disconnectBtn.style.display = "inline-block";
    addrSpan.textContent = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;

    await loadNFTs();
  } catch (err) {
    console.error(err);
    alert("Wallet connect xətası!");
  }
}

disconnectBtn.onclick = () => {
  provider = signer = seaport = userAddress = null;
  connectBtn.style.display = "inline-block";
  disconnectBtn.style.display = "none";
  addrSpan.textContent = "";
  marketplaceDiv.innerHTML = "";
  notify("Cüzdan ayırıldı", 2000);
};

connectBtn.onclick = connectWallet;

// ===================== LOAD NFTS =====================
let loadingNFTs = false;
let loadedCount = 0;
const BATCH_SIZE = 12;
let allNFTs = [];

async function loadNFTs() {
  if (loadingNFTs) return;
  loadingNFTs = true;

  try {
    if (allNFTs.length === 0) {
      const res = await fetch(`${BACKEND_URL}/api/nfts`);
      const data = await res.json();
      allNFTs = data.nfts || [];
    }

    if (loadedCount >= allNFTs.length) {
      if (loadedCount === 0)
        marketplaceDiv.innerHTML = "<p>Bu səhifədə NFT yoxdur.</p>";
      return;
    }

    const batch = allNFTs.slice(loadedCount, loadedCount + BATCH_SIZE);
    loadedCount += batch.length;

    for (const nft of batch) {
      const tokenid = nft.tokenid;
      let name = nft.name || `Bear #${tokenid}`;
      let image = nft.image;
      if (image?.startsWith("ipfs://"))
        image = image.replace("ipfs://", "https://ipfs.io/ipfs/");

      const card = document.createElement("div");
      card.className = "nft-card";
      card.innerHTML = `
        <img src="${image}" alt="NFT image">
        <h4>${name}</h4>
        <p class="price">Qiymət: ${nft.price ?? "-"} APE</p>
        <div class="nft-actions">
            <input type="number" min="0" step="0.01" class="price-input" placeholder="Qiymət (APE)">
            <button class="wallet-btn buy-btn" data-id="${tokenid}">Buy</button>
            <button class="wallet-btn list-btn" data-token="${tokenid}">List</button>
        </div>
      `;
      marketplaceDiv.appendChild(card);

      card.querySelector(".buy-btn").onclick = async () => {
        await buyNFT(nft);
      };

      card.querySelector(".list-btn").onclick = async () => {
        const priceStr = card.querySelector(".price-input").value.trim();
        if (!priceStr) return notify("Qiymət boşdur");
        let priceWei;

        try {
          priceWei = ethers.utils.parseEther(priceStr);
        } catch {
          return notify("Qiymət düzgün deyil");
        }

        await listNFT(tokenid, priceWei, card);
      };
    }
  } catch (err) {
    console.error(err);
  } finally {
    loadingNFTs = false;
  }
}

window.addEventListener("scroll", () => {
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 300)
    loadNFTs();
});

// ===================== BUY NFT (FINAL) =====================
async function buyNFT(nftRecord) {
  if (!signer || !seaport) return alert("Cüzdan qoşulmayıb!");
  notify("Alış hazırlanır...");

  let rawOrder =
    nftRecord.seaport_order ??
    nftRecord.seaportOrderJSON ??
    nftRecord.signedOrder ??
    null;

  if (typeof rawOrder === "string") {
    try {
      rawOrder = JSON.parse(rawOrder);
    } catch {}
  }

  if (rawOrder?.order) rawOrder = rawOrder.order;
  if (!rawOrder?.parameters) {
    try {
      rawOrder = JSON.parse(nftRecord.seaportOrderJSON || "{}");
    } catch {}
  }

  if (!rawOrder || !rawOrder.parameters)
    return alert("Order tapılmadı!");

  try {
    const buyer = await signer.getAddress();
    notify("Transaction göndərilir...");

    const fulfillment = await seaport.fulfillOrder({
      order: rawOrder,
      accountAddress: buyer,
    });

    const tx =
      (fulfillment.executeAllActions &&
        (await fulfillment.executeAllActions())) ||
      (fulfillment.execute && (await fulfillment.execute())) ||
      fulfillment;

    if (tx?.wait) await tx.wait();

    notify("NFT alındı! ✅");

    await fetch(`${BACKEND_URL}/api/buy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenid: nftRecord.tokenid,
        nft_contract: NFT_CONTRACT_ADDRESS,
        marketplace_contract: SEAPORT_CONTRACT_ADDRESS,
        buyer_address: buyer,
        seaport_order: rawOrder,
        order_hash: nftRecord.order_hash,
        on_chain: true,
      }),
    });

    loadedCount = 0;
    allNFTs = [];
    marketplaceDiv.innerHTML = "";
    loadNFTs();
  } catch (err) {
    console.error(err);
    alert("Buy xətası: " + err.message);
  }
}

// ===================== LIST NFT =====================
async function listNFT(tokenid, priceWei, card) {
  if (!signer || !seaport) return alert("Cüzdan qoşulmayıb!");

  // 🔴 DÜZƏLİŞİN ƏSAS HİSSƏSİ: tokenid-ni BigNumber obyektinə çeviririk
  const tokenIdBN = ethers.BigNumber.from(tokenid.toString()); 
  
  const seller = (await signer.getAddress()).toLowerCase();

  const nftContract = new ethers.Contract(
    NFT_CONTRACT_ADDRESS,
    [
      "function ownerOf(uint256) view returns (address)",
      "function isApprovedForAll(address,address) view returns(bool)",
      "function setApprovalForAll(address,bool)",
    ],
    signer
  );

  notify("Sahiblik yoxlanılır...");

  // nftContract.ownerOf() funksiyasına BN ötürülür
  const owner = (await nftContract.ownerOf(tokenIdBN)).toLowerCase(); 
  if (owner !== seller) return alert("NFT sənə məxsus deyil!");

  const approved = await nftContract.isApprovedForAll(
    seller,
    SEAPORT_CONTRACT_ADDRESS
  );

  if (!approved) {
    notify("Approve göndərilir...");
    const tx = await nftContract.setApprovalForAll(
      SEAPORT_CONTRACT_ADDRESS,
      true
    );
    await tx.wait();
  }

  notify("Order yaradılır...");

  const orderParams = {
    offerer: seller,
    offer: [
      {
        itemType: 2,
        token: NFT_CONTRACT_ADDRESS,
        // identifierOrCriteria üçün BN-in string formatı istifadə olunur
        identifierOrCriteria: tokenIdBN.toString(), 
        startAmount: "1",
        endAmount: "1",
      },
    ],
    consideration: [
      {
        itemType: 0,
        token: ethers.constants.AddressZero,
        identifierOrCriteria: "0",
        startAmount: priceWei.toString(),
        endAmount: priceWei.toString(),
        recipient: seller,
      },
    ],
    startTime: Math.floor(Date.now() / 1000).toString(),
    endTime: (Math.floor(Date.now() / 1000) + 30 * 86400).toString(),
    orderType: 0,
    zone: ethers.constants.AddressZero,
    conduitKey: "0x".padEnd(66, "0"),
    salt: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
  };

  try {
    const req = await seaport.createOrder(orderParams);
    const signed =
      (req.executeAllActions && (await req.executeAllActions())) ||
      (req.execute && (await req.execute())) ||
      req;

    const finalOrder = signed.order ?? signed.signedOrder ?? signed;

    const orderHash = seaport.getOrderHash(finalOrder.parameters);

    const plainOrder = orderToJsonSafe(finalOrder);
    
    notify("Order backend-ə göndərilir...");

    const res = await fetch(`${BACKEND_URL}/api/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenid,
        price: ethers.utils.formatEther(priceWei),
        nft_contract: NFT_CONTRACT_ADDRESS,
        marketplace_contract: SEAPORT_CONTRACT_ADDRESS,
        seller_address: seller,
        seaport_order: plainOrder,
        order_hash: orderHash,
        on_chain: false,
      }),
    });

    const j = await res.json();
    if (!j.success) {
      return alert("Backend order-u qəbul etmədi! Səbəb: " + (j.error || "Bilinməyən xəta"));
    }

    card.querySelector(".price").textContent =
      "Qiymət: " + ethers.utils.formatEther(priceWei) + " APE";

    notify(`NFT #${tokenid} list olundu!`);

    loadedCount = 0;
    allNFTs = [];
    marketplaceDiv.innerHTML = "";
    loadNFTs();
  } catch (err) {
    console.error(err);
    alert("Listing xətası: " + err.message);
  }
}

// ===================== EXPORT TO WINDOW =====================
window.buyNFT = buyNFT;
window.listNFT = listNFT;
window.loadNFTs = loadNFTs;

// ===================== END FILE 
