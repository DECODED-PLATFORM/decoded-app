import { initializeApp, FirebaseApp, FirebaseOptions } from "firebase/app";
import {
  getFirestore,
  Firestore,
  getDocs,
  collection,
  doc,
  getDoc,
} from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import {
  getStorage,
  FirebaseStorage,
  ref,
  StorageReference,
} from "firebase/storage";
import {
  ImageDetail,
  ItemMetadata,
  HoverItem,
  TaggedItem,
  News,
} from "@/types/model";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Singleton
export class FirebaseHelper {
  private static instance: FirebaseHelper;
  app: FirebaseApp;
  config: FirebaseOptions;
  private constructor() {
    if (
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY === undefined ||
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN === undefined ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === undefined ||
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET === undefined ||
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID === undefined ||
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID === undefined ||
      process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID === undefined
    ) {
      throw new Error("Environment variable is undefined");
    }
    this.config = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    };
    this.app = initializeApp(this.config);
  }

  public static getInstance(): FirebaseHelper | never {
    if (!FirebaseHelper.instance) {
      try {
        FirebaseHelper.instance = new FirebaseHelper();
      } catch (error) {
        throw new Error(
          "Error occured while creating instance of `FirebaseHelper`"
        );
      }
    }
    return FirebaseHelper.instance;
  }

  public static app(): FirebaseApp | never {
    try {
      return this.getInstance().app;
    } catch (error) {
      throw new Error("Error occured while getting app instance");
    }
  }

  public static db(): Firestore | never {
    try {
      return getFirestore(this.app());
    } catch (error) {
      throw new Error("Error occured while getting db instance");
    }
  }

  public static storage(): FirebaseStorage | never {
    try {
      return getStorage(
        this.app(),
        `gs://${this.getInstance().config.storageBucket}`
      );
    } catch (error) {
      throw new Error("Error occured while getting storage instance");
    }
  }

  public static async getImageDetail(
    collectionName: string,
    docId?: string
  ): Promise<ImageDetail | ImageDetail[] | undefined> {
    try {
      const db = this.db();
      if (docId) {
        const docRef = doc(db, collectionName, docId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          let imageDetail = docSnap.data() as ImageDetail;
          try {
            const hoverItemList: Promise<HoverItem | undefined>[] =
              imageDetail.taggedItem.map(async (item) => {
                const taggedItem = item as TaggedItem;
                const docRef = doc(db, "items", taggedItem.id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                  const itemMetadata = docSnap.data() as ItemMetadata;
                  return {
                    position: taggedItem.position,
                    metadata: itemMetadata,
                  };
                }
              });
            imageDetail.taggedItem = (await Promise.all(hoverItemList)).filter(
              (item) => item !== undefined
            ) as HoverItem[];
            console.log("🚀🚀 Final result", imageDetail);
            return imageDetail;
          } catch (error) {
            console.log(error);
          }
        } else {
          console.log("No such document!");
        }
      } else {
        const querySnapshot = await getDocs(collection(db, collectionName));
        querySnapshot.forEach((doc) => {
          console.log(doc.data());
        });
      }
    } catch (error) {
      throw new Error(
        `Error occured while trying to get document for ${collectionName}`
      );
    }
  }

  public static storageRef(points: string): StorageReference | never {
    try {
      return ref(this.storage(), points);
    } catch (error) {
      throw new Error("Error occured while getting storage reference");
    }
  }
}
