"use client";
import Image from "next/image";
import { useState, ChangeEvent, useEffect } from "react";
import {
  TaggedItem,
  ItemInfo,
  ImageInfo,
  BrandInfo,
  Position,
} from "@/types/model";
import { FirebaseHelper } from "@/common/firebase";
import {
  main_font,
  getByteSize,
  create_doc_id,
} from "@/components/helpers/util";
import { ConvertImageAndCompress } from "@/components/helpers/util";
import AdminLogin from "../admin/page";
import { sha256 } from "js-sha256";

import { Modal } from "@/components/ui/modal";

function AdminDashboard() {
  const [isLogin, setIsLogin] = useState(false);
  const [brands, setBrands] = useState<string[] | null>(null);

  useEffect(() => {
    const fetchBrands = async () => {
      if (!isLogin) return;
      console.log("Fetching brands...");
      const docs = await FirebaseHelper.docs("brands");
      const fetchedBrands: string[] = [];
      docs.forEach((doc) => {
        const brand = doc.data() as BrandInfo;
        fetchedBrands.push(brand.name);
      });
      setBrands(fetchedBrands);
    };
    fetchBrands();
  }, [isLogin]);

  return !isLogin ? (
    <AdminLogin setIsLogin={setIsLogin} />
  ) : (
    <div>
      <UploadImageSection brands={brands} />
      <RequestListSection />
    </div>
  );
}

function UploadImageSection({ brands }: { brands: string[] | null }) {
  const [uploadImageState, setUploadImageState] =
    useState<UploadImageState | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(
    null
  );
  const [expandedSections, setExpandedSections] = useState<{
    [key: number]: boolean;
  }>({});

  const upload = async () => {
    setIsUploading(true);
    console.log(uploadImageState);
    if (!uploadSanityCheck()) {
      alert("Required fields are empty!");
      return;
    }
    const file = uploadImageState?.imageFile;
    const hoverItemInfo = uploadImageState?.hoverItems;
    const artistName = uploadImageState?.artistName;
    // It is safe to force unwrap due to sanity check
    const tags = await prepareTags(file!, hoverItemInfo!, artistName!);
    if (tags instanceof Error) {
      alert("Error preparing tags!");
      setIsUploading(false);
      return false;
    }
    if (!tagsSanityCheck(tags)) {
      alert("Invalid tags!");
      setIsUploading(false);
      return;
    }
    console.log(tags);
    console.log("Handle hover item");
    let taggedItems = await handleUploadHoverItem(tags);
    if (taggedItems instanceof Error) {
      console.error("Error saving hover item:", taggedItems);
      alert("Error saving hover item!");
      return;
    }
    console.log("Handle upload image");
    await handleUploadImage(tags, taggedItems);
    console.log("Handle remain tags");
    await handleRemain(tags);
    console.log("Upload: All Done! ✅");
    reset();
    setIsUploading(false);
  };

  const tagsSanityCheck = (tags: Record<string, string[]> | Error): boolean => {
    const requiredKeys = ["brands", "artists", "images", "items"];
    const missingKeys = requiredKeys.filter((key) => !tags.hasOwnProperty(key));
    return missingKeys.length === 0;
  };

  const uploadSanityCheck = (): boolean => {
    if (
      !uploadImageState?.imageName ||
      !uploadImageState?.imageFile ||
      !uploadImageState?.artistName ||
      !uploadImageState?.description ||
      !uploadImageState?.hoverItems ||
      !uploadImageState?.selectedImageUrl ||
      !uploadImageState?.imageFileName
    ) {
      return false;
    }
    return true;
  };

  const prepareTags = async (
    file: File,
    hoverItems: HoverItemInfo[],
    artistName: string
  ): Promise<Record<string, string[]> | Error> => {
    const tags: Record<string, string[]> = {};
    for (let index = 0; index < hoverItems.length; index++) {
      const hoverItemInfo = hoverItems[index];
      const item_doc_id = sha256(hoverItemInfo.info.name);
      if (!hoverItemInfo.brandName) {
        throw new Error("Invalid data!");
      }
      const brand_doc_ids = hoverItemInfo.brandName.map((b) => sha256(b));
      // { "items" => [] }
      tags["items"] = [...(tags["items"] || []), item_doc_id];
      // { "brands" => [] }
      tags["brands"] = [...(tags["brands"] || []), ...brand_doc_ids];
      // { item_doc_id => brands}
      tags[item_doc_id] = brand_doc_ids;
    }
    const image_doc_id = sha256(await file.arrayBuffer());
    tags["images"] = [image_doc_id];
    const artist_doc_id = create_doc_id(artistName);
    tags["artists"] = [artist_doc_id];
    return tags;
  };

  const handleHoverItemTags = (
    tags: Record<string, string[]>,
    hoverItem: HoverItemInfo
  ) => {
    // TODO: Save tags to db
    const item_doc_id = sha256(hoverItem.info.name);
    const brand_doc_ids = tags[item_doc_id];
    hoverItem.info.tags = {
      images: tags["images"],
      brands: brand_doc_ids,
      artists: tags["artists"],
    };
  };

  const handleImageTags = (
    tags: Record<string, string[]>,
    imageInfo: ImageInfo
  ) => {
    imageInfo.tags = {
      items: tags["items"],
      brands: tags["brands"],
      artists: tags["artists"],
    };
  };

  const reset = () => {
    setUploadImageState(null);
    setSelectedPointIndex(null);
    setExpandedSections({});
  };

  const toggleSection = (index: number) => {
    setExpandedSections((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const removePoint = (index: number) => {
    const updatedHoverItems = uploadImageState?.hoverItems?.filter(
      (_, itemIndex) => itemIndex !== index
    );
    setUploadImageState((prev) => ({
      ...prev,
      hoverItems: updatedHoverItems,
    }));
    setSelectedPointIndex(null);
  };
  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const fileURL = URL.createObjectURL(file);
      setUploadImageState((prevState) => ({
        ...prevState,
        selectedImageUrl: fileURL,
        imageFile: file,
        hoverItems: [],
      }));
    }
  };

  const handlePointClick = (event: React.MouseEvent<HTMLImageElement>) => {
    const target = event.target as HTMLImageElement;
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const topPercent = `${((y / rect.height) * 100).toFixed(2)}%`;
    const leftPercent = `${((x / rect.width) * 100).toFixed(2)}%`;

    console.log(topPercent, leftPercent);
    setUploadImageState((prevState) => ({
      ...prevState,
      hoverItems: [
        ...(prevState?.hoverItems || []),
        {
          pos: { top: topPercent, left: leftPercent },
          info: {
            name: "",
            price: ["", ""],
            hyped: 0,
            affiliateUrl: "",
            imageUrl: "",
            category: "",
            tags: {},
            description: "",
          },
        },
      ],
    }));
  };

  const handleHoverItemInfo = (
    index: number,
    field: keyof ItemInfo | undefined,
    isCurrency: boolean,
    value: number | string | string[] | File
  ) => {
    setUploadImageState((prevState) => {
      if (!prevState) return null; // prevState가 null이면 아무 작업도 하지 않고 null을 반환

      const hoverItems = prevState.hoverItems || [];
      // prevState에서 hoverItems를 복사하여 새로운 배열을 생성
      const updatedHoverItems = [...hoverItems];

      // field 값에 따라 적절한 타입으로 값을 할당
      if (field === "tags") {
        return prevState; // tags는 여기서 처리하지 않음
      } else if (field === "hyped") {
        updatedHoverItems[index].info[field] = value as number;
      } else if (field === "price") {
        if (isCurrency) {
          updatedHoverItems[index].info[field]![1] = value as string;
        } else {
          updatedHoverItems[index].info[field]![0] = value as string;
        }
      } else {
        if (field) {
          updatedHoverItems[index].info[field] = value as string;
        } else {
          if (value instanceof File) {
            updatedHoverItems[index].hoverItemFile = value;
          } else {
            // Brands
            updatedHoverItems[index].brandName = value as string[];
          }
        }
      }
      // 업데이트된 hoverItems로 상태를 업데이트
      return { ...prevState, hoverItems: updatedHoverItems };
    });
  };

  const handleRemain = async (tags: Record<string, string[]>) => {
    const db = FirebaseHelper.db();
    const brands = tags["brands"];
    brands.map(async (b) => {
      await FirebaseHelper.updateDoc("brands", b, {
        tags: {
          images: tags["images"],
          artists: tags["artists"],
          items: tags["items"],
        },
      });
    });
    // There will be only one artist
    const artistDocId = tags["artists"][0];
    await FirebaseHelper.updateDoc("artists", artistDocId, {
      tags: {
        images: tags["images"],
        brands: tags["brands"],
        items: tags["items"],
      },
    });
  };

  const handleUploadImage = async (
    tags: Record<string, string[]>,
    taggedItems: TaggedItem[]
  ) => {
    const imageInfo: ImageInfo = {
      title: uploadImageState?.imageName!,
      description: uploadImageState?.description,
      hyped: 0,
      taggedItem: taggedItems,
      updateAt: new Date(),
      tags: {},
    };
    try {
      const imageFile = await ConvertImageAndCompress(
        uploadImageState?.imageFile!,
        1,
        1280
      );
      const path = "images/" + uploadImageState?.imageName!;
      const image_doc_id = tags["images"][0];
      // Upload image to storage
      await FirebaseHelper.uploadDataToStorage(path, imageFile, {
        customMetadata: {
          // Hash of image is only one
          id: image_doc_id,
        },
      });
      handleImageTags(tags, imageInfo);
      // Upload `imageInfo` to db
      await FirebaseHelper.setDoc("images", image_doc_id, imageInfo);
      console.log(
        "Original File Size (KB):",
        (uploadImageState?.imageFile!.size! / 1024).toFixed(2)
      );
      console.log(
        "Compressed File Size (KB):",
        (imageFile.size / 1024).toFixed(2)
      );
      alert("Image uploaded successfully!");
    } catch (error) {
      console.error("Error saving image detail:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadHoverItem = async (
    tags: Record<string, string[]>
  ): Promise<TaggedItem[] | Error> => {
    var taggedItems: TaggedItem[] = [];
    const hoverItems = uploadImageState?.hoverItems!;
    for (let index = 0; index < hoverItems.length; index++) {
      const hoverFile = hoverItems[index].hoverItemFile;
      var hoverItem = hoverItems[index];
      // Handle image such as converting to webp and uploading to db
      const storage_file_name = hoverItem.info.name
        .replace(/\s+/g, "_")
        .toLowerCase();
      let downloadUrl = "";
      if (
        hoverFile &&
        (hoverFile.type.includes("jpeg") ||
          hoverFile.type.includes("png") ||
          hoverFile.type.includes("webp") ||
          hoverFile.type.includes("avif"))
      ) {
        try {
          console.log("Trying to convert to webp...");
          const itemImage = await ConvertImageAndCompress(hoverFile, 1, 1280);
          console.log("Convert & Compress done!");
          console.log("Creating storage ref items/", storage_file_name);
          // TODO: Duplicate check
          const uploadRes = await FirebaseHelper.uploadDataToStorage(
            "items/" + storage_file_name,
            itemImage
          );
          downloadUrl = await FirebaseHelper.downloadUrl(uploadRes.ref);
        } catch (error) {
          console.error("Error saving item image:", error, hoverItem);
          alert("Error saving item image!");
          return new Error("Error saving item image!");
        }
      } else {
        alert(
          "Image file format is not valid! Should be either jpeg, png, webp, avif"
        );
        setIsUploading(false);
        return new Error("Image file format is not valid!");
      }
      hoverItem.info.imageUrl = downloadUrl;
      // Handle hoverItem tags
      handleHoverItemTags(tags, hoverItem);
      const doc_id = create_doc_id(storage_file_name);
      console.log("Set document for ", doc_id);
      await FirebaseHelper.setDoc("items", doc_id, hoverItem.info);
      console.log("Done!");
      taggedItems.push({ id: doc_id, pos: hoverItem.pos });
    }
    return taggedItems;
  };

  const filteredBrands = brands?.filter((brand) =>
    brand?.toLowerCase().includes(searchKeyword.toLowerCase())
  );

  return (
    <div className="mx-auto p-3 border-l-2 border-r-2 border-b-2 border-black rounded-md">
      <h1 className={`text-2xl font-bold mb-5 ${main_font.className}`}>
        Upload
      </h1>
      <div className="flex flex-col md:flex-row items-center justify-center gap-4">
        <input type="file" onChange={handleImageChange} className="mb-4" />
        {/* Image Section */}
        <div className="flex-1">
          {uploadImageState?.selectedImageUrl && (
            <div
              className="rounded-lg shadow-lg overflow-hidden mt-10"
              style={{
                width: "100%",
                maxWidth: "400px",
                aspectRatio: "3/4",
                position: "relative",
              }}
            >
              <Image
                src={uploadImageState?.selectedImageUrl}
                alt="Featured fashion"
                layout="fill"
                objectFit="cover"
                onClick={handlePointClick}
              />
              {uploadImageState?.hoverItems?.map((item, index) => (
                <div
                  key={index}
                  className={`absolute w-3 h-3 bg-blue-500 rounded-full ${
                    index === selectedPointIndex
                      ? "opacity-100 point-animation"
                      : "opacity-50"
                  }`}
                  style={{
                    top: item.pos.top,
                    left: item.pos.left,
                    transform: "translate(-50%, -50%)",
                  }}
                  onClick={() => setSelectedPointIndex(index)}
                ></div>
              ))}
            </div>
          )}
        </div>
        {/* HoverItem Section */}
        <div className="flex-1 space-y-4 align-top justify-between">
          {uploadImageState?.hoverItems?.map((item, index) => (
            <div
              key={index}
              className="flex flex-col p-4 border-b border-gray-200 items-center "
            >
              <div className="flex flex-1 w-full items-center m-2 justify-between">
                <button
                  onClick={() => toggleSection(index)}
                  className="btn bg-[#FF204E] btn-xs text-black"
                >
                  {expandedSections[index] ? "Hide" : "Show"}
                </button>
                <button
                  onClick={() => removePoint(index)}
                  className="btn bg-[#FF204E] btn-xs text-black"
                >
                  x
                </button>
              </div>
              <div
                className="flex flex-1 justify-between"
                onClick={() => setSelectedPointIndex(index)}
              >
                {expandedSections[index] && (
                  <div>
                    <input
                      type="text"
                      placeholder="Name"
                      value={item.info.name}
                      onChange={(e) => {
                        handleHoverItemInfo(
                          index,
                          "name",
                          false,
                          e.target.value
                        );
                      }}
                      className="input input-bordered w-full mb-2 dark:bg-white"
                    />
                    <div className="flex">
                      <input
                        type="text"
                        placeholder="Price"
                        value={item.info.price?.[0]}
                        onChange={(e) => {
                          handleHoverItemInfo(
                            index,
                            "price",
                            false,
                            e.target.value
                          );
                        }}
                        className="input input-bordered w-full mb-2 dark:bg-white"
                      />
                      <select
                        value={item.info.price?.[1]}
                        onChange={(e) => {
                          handleHoverItemInfo(
                            index,
                            "price",
                            true,
                            e.target.value
                          );
                        }}
                        className="input w-20 mb-2 dark:bg-white"
                      >
                        {Object.values(Currency).map((currency) => (
                          <option key={currency} value={currency}>
                            {currency}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="text"
                      placeholder="URL"
                      value={item.info.affiliateUrl}
                      onChange={(e) => {
                        handleHoverItemInfo(
                          index,
                          "affiliateUrl",
                          false,
                          e.target.value
                        );
                      }}
                      className="input input-bordered w-full mb-2 dark:bg-white"
                    />
                    <div className="flex">
                      <select
                        value={item.info.category}
                        onChange={(e) => {
                          handleHoverItemInfo(
                            index,
                            "category",
                            false,
                            e.target.value
                          );
                        }}
                        className="input input-bordered w-full mb-2 dark:bg-white"
                      >
                        {Object.values(ItemCategory).map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="브랜드 검색..."
                        className="input input-bordered w-full mb-2 dark:bg-white"
                        value={searchKeyword}
                        onChange={(e) => {
                          setSearchKeyword(e.target.value);
                        }}
                      />
                      <select
                        multiple={true}
                        className="input input-bordered w-full mb-2 dark:bg-white"
                        value={item.brandName}
                        onChange={(e) => {
                          const selectedOptions = Array.from(
                            e.target.selectedOptions,
                            (option) => option.value
                          );
                          handleHoverItemInfo(
                            index,
                            undefined,
                            false,
                            selectedOptions
                          );
                        }}
                      >
                        {filteredBrands?.map((brand, index) => (
                          <option key={index} value={brand}>
                            {brand}
                          </option>
                        ))}
                      </select>
                      {filteredBrands?.length == 0 && (
                        <>
                          <button
                            className={`btn bg-[#FF204E] ${main_font.className} m-2 text-black`}
                            onClick={() =>
                              (
                                document.getElementById(
                                  "my_modal_2"
                                ) as HTMLDialogElement
                              )?.showModal()
                            }
                          >
                            Add New Brand
                          </button>
                          <Modal />
                        </>
                      )}
                    </div>
                    <input
                      type="file"
                      onChange={(e) =>
                        handleHoverItemInfo(
                          index,
                          undefined,
                          false,
                          e.target.files![0]
                        )
                      }
                      className="input w-full dark:bg-white"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {uploadImageState?.selectedImageUrl && (
        <div className="p-4 border-t border-gray-200">
          <input
            type="text"
            placeholder="File Name (e.g rose_in_nyc)"
            value={uploadImageState?.imageFileName ?? ""}
            onChange={(e) =>
              setUploadImageState({
                ...uploadImageState,
                imageFileName: e.target.value,
              })
            }
            className="input input-bordered w-full mb-2 dark:bg-white"
          />
          <input
            type="text"
            placeholder="Image Title (e.g Rose in NYC)"
            value={uploadImageState?.imageName ?? ""}
            onChange={(e) =>
              setUploadImageState({
                ...uploadImageState,
                imageName: e.target.value,
              })
            }
            className="input input-bordered w-full mb-2 dark:bg-white"
          />
          <input
            type="text"
            placeholder="Artist Name(e.g rose)"
            value={uploadImageState?.artistName ?? ""}
            onChange={(e) =>
              setUploadImageState({
                ...uploadImageState,
                artistName: e.target.value,
              })
            }
            className="input input-bordered w-full mb-2 dark:bg-white"
          />
          {/* TODO: Replace with generated by LLM */}
          <input
            type="text"
            placeholder="Description"
            value={uploadImageState?.description ?? ""}
            onChange={(e) => {
              const inputText = e.target.value;
              if (getByteSize(inputText) <= 500) {
                setUploadImageState({
                  ...uploadImageState,
                  description: inputText,
                });
              }
            }}
            className="input input-bordered w-full mb-2 dark:bg-white"
          />
          <button
            onClick={upload}
            className="btn btn-primary mt-4 w-full bg-gradient-to-r from-blue-500 to-purple-600"
          >
            {isUploading ? (
              <span className="loading loading-spinner loading-md"></span>
            ) : (
              "Upload"
            )}
          </button>
        </div>
      )}
    </div>
  );
}

interface Request {
  request_id: string;
  description: string;
  name: string;
  status: string;
}

function RequestListSection() {
  const [requests, setRequests] = useState<Request[]>([]);
  return (
    <div
      className={`p-4 text-2xl font-bold ${main_font.className} border-l-2 border-r-2 border-b-2 border-black rounded-md`}
    >
      <h2>Requests</h2>
      <table className="table-auto w-full mt-4">
        <thead>
          <tr>
            <th className="px-4 py-2">Request ID</th>
            <th className="px-4 py-2">Description</th>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.request_id}>
              <td className="border px-4 py-2">{request.request_id}</td>
              <td className="border px-4 py-2">{request.description}</td>
              <td className="border px-4 py-2">{request.name}</td>
              <td className="border px-4 py-2">{request.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface UploadImageState {
  selectedImageUrl?: string;
  hoverItems?: HoverItemInfo[];
  imageFile?: File;
  imageFileName?: string;
  imageName?: string;
  artistName?: string;
  description?: string;
}

interface HoverItemInfo {
  pos: Position;
  info: ItemInfo;
  brandName?: string[];
  hoverItemFile?: File;
}

enum ItemCategory {
  Clothing = "clothing",
  Paint = "paint",
  Furniture = "furniture",
  Accessory = "accessory",
  Shoes = "shoes",
  Bag = "bag",
}

enum Currency {
  USD = "USD",
  KRW = "KRW",
  EUR = "EUR",
  JPY = "JPY",
  GBP = "GBP",
}

export default AdminDashboard;
