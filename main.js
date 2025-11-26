// ===================== MAIN.JS (DÜZƏLDİLMİŞ VERSİYA) =====================
import { ethers } from "ethers";
import { Seaport } from "@opensea/seaport-js";

// ===================== CONFIG =====================
const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  window?.__BACKEND_URL__ ||
  "https://kamoaze30.onrender.com";

const NFT_CONTRACT_ADDRESS =
  import.meta.env.VITE_NFT_CONTRACT ||
  window?.__NFT_CONTRACT__ ||
  "0x54a88333F6e7540eA982261301309048aC431eD5";

const SEAPORT_CONTRACT_ADDRESS =
  import.meta.env.VITE_SEAPORT_CONTRACT ||
  window?.__SEAPORT_CONTRACT__ ||
  "0x0000000000000068F116a894984e2DB1123eB395"; 

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

function orderToJsonSafe(obj) {
  return JSON.parse(
    JSON.stringify(obj, (k, v) => {
      if (v && typeof v === "object" && v.type === 'BigNumber' && v.hex) {
          try { return ethers.BigNumber.from(v.hex).toString(); } catch { return v.hex; }
      }
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

    // Seaport konfiqurasiyası
    seaport = new Seaport(signer, { 
        contractAddress: SEAPORT_CONTRACT_ADDRESS,
        // Override lazım ola bilər, amma hələlik sadə saxlayırıq
    });

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
        <p class="price">Qiymət: ${nft.price && nft.price > 0 ? nft.price + ' APE' : "-"}</p>
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

      card.querySelector(".list-btn").onclick = async (e) => {
        const listBtn = e.currentTarget;
        const tokenidFromAttr = listBtn.getAttribute("data-token"); 

        if (!tokenidFromAttr || tokenidFromAttr === "undefined") return notify("XƏTA: Token ID tapılmadı.");

        const priceStr = card.querySelector(".price-input").value.trim();
        if (!priceStr) return notify("Qiymət boşdur");
        
        let priceWei;
        try {
          priceWei = ethers.utils.parseEther(priceStr);
        } catch {
          return notify("Qiymət düzgün deyil");
        }

        await listNFT(tokenidFromAttr, priceWei, card);
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

// ===================== BUY NFT =====================
async function buyNFT(nftRecord) {
  if (!signer || !seaport) return alert("Cüzdan qoşulmayıb!");
  notify("Alış hazırlanır...");

  let rawOrder = nftRecord.seaport_order ?? nftRecord.seaportOrderJSON ?? nftRecord.signedOrder ?? null;

  if (typeof rawOrder === "string") {
    try { rawOrder = JSON.parse(rawOrder); } catch {}
  }

  // Strukturun uyğunluğunu yoxla
  if (rawOrder?.order) rawOrder = rawOrder.order;
  
  if (!rawOrder || !rawOrder.parameters)
    return alert("Bu NFT satışda deyil və ya Order tapılmadı!");

  try {
    const buyer = await signer.getAddress();
    notify("Transaction göndərilir...");

    const fulfillment = await seaport.fulfillOrder({
      order: rawOrder,
      accountAddress: buyer,
    });

    const tx =
      (fulfillment.executeAllActions && (await fulfillment.executeAllActions())) ||
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

    // Səhifəni yenilə
    loadedCount = 0;
    allNFTs = [];
    marketplaceDiv.innerHTML = "";
    loadNFTs();
  } catch (err) {
    console.error(err);
    alert("Buy xətası: " + (err.reason || err.message));
  }
}

// ===================== LIST NFT (DÜZƏLDİLDİ) =====================
async function listNFT(tokenid, priceWei, card) {
  if (!signer || !seaport) return alert("Cüzdan qoşulmayıb!");
  if (!tokenid) return alert("Listing xətası: Token ID boşdur.");

  try {
    const tokenIdBN = ethers.BigNumber.from(tokenid.toString()); 
    const priceWeiBN = ethers.BigNumber.from(priceWei); // Artıq BigNumber gəlir, amma sığortalayırıq

    const seller = (await signer.getAddress()).toLowerCase();

    // 1. Sahiblik Yoxlanışı
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
    const owner = (await nftContract.ownerOf(tokenIdBN)).toLowerCase(); 
    if (owner !== seller) return alert("NFT sənə məxsus deyil!");

    // 2. Approve Yoxlanışı
    const approved = await nftContract.isApprovedForAll(seller, SEAPORT_CONTRACT_ADDRESS);
    if (!approved) {
      notify("Approve göndərilir...");
      const tx = await nftContract.setApprovalForAll(SEAPORT_CONTRACT_ADDRESS, true);
      await tx.wait();
    }

    notify("Order yaradılır...");

    // Seaport CreateOrder Parametrləri
    // DİQQƏT: fees: [] vacibdir!
    const orderParams = {
      offer: [
        {
          itemType: 2, // ERC721
          token: NFT_CONTRACT_ADDRESS,
          identifierOrCriteria: tokenIdBN.toString(), 
          startAmount: "1",
          endAmount: "1",
        },
      ],
      consideration: [
        {
          itemType: 0, // NATIVE Token (APE)
          token: ethers.constants.AddressZero,
          identifierOrCriteria: "0",
          startAmount: priceWeiBN.toString(),
          endAmount: priceWeiBN.toString(),
          recipient: seller,
        },
      ],
      // 🟢 ƏSAS DÜZƏLİŞ: fees array-i boş göndərilir
      fees: [], 
      startTime: Math.floor(Date.now() / 1000).toString(),
      endTime: (Math.floor(Date.now() / 1000) + 30 * 86400).toString(), // 30 gün
      orderType: 0, // 0 = FULL_OPEN (hər kəs ala bilər)
      zone: ethers.constants.AddressZero,
      conduitKey: "0x0000000000000000000000000000000000000000000000000000000000000000",
      salt: ethers.BigNumber.from(ethers.utils.randomBytes(32)).toString(), // Salt-ı stringə çeviririk
    };

    // 3. Orderin Yaradılması və İmzalanması
    const { executeAllActions } = await seaport.createOrder(
      orderParams, 
      seller // accountAddress
    );

    const signed = await executeAllActions();

    // Order obyektini qaytararkən uyğunsuzluqları aradan qaldırırıq
    const finalOrder = signed.order ?? signed.signedOrder ?? signed;
    const orderHash = seaport.getOrderHash(finalOrder.parameters);
    const plainOrder = orderToJsonSafe(finalOrder);
    
    notify("Order backend-ə göndərilir...");

    // 4. Backend-ə Saxlama
    const res = await fetch(`${BACKEND_URL}/api/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenid: tokenid.toString(),
        price: ethers.utils.formatEther(priceWeiBN),
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
      throw new Error(j.error || "Backend xətası");
    }

    // UI Yeniləmə
    card.querySelector(".price").textContent = "Qiymət: " + ethers.utils.formatEther(priceWeiBN) + " APE";
    card.querySelector(".price-input").value = "";
    
    notify(`NFT #${tokenid} uğurla list olundu!`);
    
    // Siyahını yeniləyirik
    setTimeout(() => {
        loadedCount = 0;
        allNFTs = [];
        marketplaceDiv.innerHTML = "";
        loadNFTs();
    }, 1500);

  } catch (err) {
    console.error("List Error:", err);
    // Əgər error obyektdirsə onu string kimi göstər
    const errMsg = err?.message || JSON.stringify(err);
    alert("Listing xətası: " + errMsg);
    notify("Xəta baş verdi", 3000);
  }
}

// ===================== EXPORT TO WINDOW =====================
window.buyNFT = buyNFT;
window.listNFT = listNFT;
window.loadNFTs = loadNFTs;
